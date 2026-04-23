import { HumanMessage } from "@langchain/core/messages";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { getPool, getCheckpointer } from "./db.js";
import { createGraph, formatProfile, log } from "./graph.js";

// ── Cognito JWT verification ───────────────────────────────────────────────────

const _region     = process.env.AWS_REGION     ?? "us-east-1";
const _userPoolId = process.env.COGNITO_USER_POOL_ID;

const _jwks = jwksClient({
  jwksUri: `https://cognito-idp.${_region}.amazonaws.com/${_userPoolId}/.well-known/jwks.json`,
  cache:     true,
  rateLimit: true,
});

async function verifyToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) throw new Error("Invalid token");
  const key = await _jwks.getSigningKey(decoded.header.kid);
  return jwt.verify(token, key.getPublicKey(), {
    algorithms: ["RS256"],
    issuer: `https://cognito-idp.${_region}.amazonaws.com/${_userPoolId}`,
  });
}

// ── Lambda entry point ────────────────────────────────────────────────────────

export async function handler(event) {
  try {
    const body = typeof event.body === "string" ? JSON.parse(event.body) : event;

    const {
      conversation_id,
      user_message,
      access_token,
      attachments,
      is_group = false,
      sender_display_name,
    } = body;

    // ── Auth — read from Authorization header first, body fallback ──────────

    const rawToken =
      (event.headers?.Authorization ?? event.headers?.authorization ?? "").replace(/^Bearer\s+/i, "")
      || access_token;

    if (!rawToken) {
      return respond(401, { error: "Missing access_token" });
    }

    let userId;
    try {
      const payload = await verifyToken(rawToken);
      userId = payload.sub;
      if (!userId) throw new Error("No sub claim");
    } catch {
      return respond(401, { error: "Invalid or expired token" });
    }

    // ── Group membership gate ───────────────────────────────────────────────

    const pool = await getPool();

    if (is_group) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM group_members WHERE conversation_id = $1 AND user_id = $2",
        [conversation_id, userId]
      );
      if (!rowCount) return respond(403, { error: "Not a member of this group" });
    }

    // ── Strip @travel-agent mention ─────────────────────────────────────────

    const cleanedMessage = (user_message ?? "").replace(/^@travel-agent\s*/i, "").trim();

    // ── Save user message (skipped for group chats — frontend writes it) ────

    if (!is_group) {
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content, is_agent, attachments)
         VALUES ($1, 'user', $2, false, $3)`,
        [conversation_id, user_message, attachments ? JSON.stringify(attachments) : null]
      );
    }

    // ── Load user profile ───────────────────────────────────────────────────

    let userPreferences = null;
    let destination     = "maui";

    if (is_group) {
      const membersRes = await pool.query(
        "SELECT user_id FROM group_members WHERE conversation_id = $1",
        [conversation_id]
      );
      const memberIds = membersRes.rows.map(r => r.user_id);

      let profileBlock = "Group members' travel preferences:\n";
      if (memberIds.length) {
        const profilesRes = await pool.query(
          "SELECT * FROM user_profiles WHERE id = ANY($1::uuid[])",
          [memberIds]
        );
        const profileMap = Object.fromEntries(profilesRes.rows.map(p => [p.id, p]));

        profileBlock += memberIds.map(id => {
          const profile  = profileMap[id] ?? {};
          const name     = id === userId
            ? `${sender_display_name ?? profile.display_name ?? "Unknown"} (invoked @travel-agent)`
            : profile.display_name ?? "Unknown";
          return `${name}:\n${formatProfile(profile) || "(no preferences set)"}`;
        }).join("\n\n");
      }

      userPreferences = { __isGroup: true, __block: profileBlock, __invoker: sender_display_name };
    } else {
      const profileRes = await pool.query(
        "SELECT * FROM user_profiles WHERE id = $1",
        [userId]
      );
      const profile = profileRes.rows[0] ?? {};
      destination   = profile.destination?.trim() || "maui";

      const profileText = formatProfile(profile);
      userPreferences   = {
        __isGroup: false,
        __block:   profileText ? `User Profile (from onboarding):\n${profileText}` : "",
        ...profile,
      };
    }

    // ── Run LangGraph agent ─────────────────────────────────────────────────

    const checkpointer = await getCheckpointer();
    const graph        = createGraph(checkpointer);
    const config       = { configurable: { thread_id: conversation_id } };

    log({ handler: "invoke_start", conversation_id, userId, is_group, destination });

    const finalState = await graph.invoke(
      {
        messages:         [new HumanMessage(cleanedMessage)],
        user_preferences: userPreferences,
        destination,
      },
      config
    );

    // ── Extract final response ──────────────────────────────────────────────

    const allMessages = finalState.messages ?? [];
    const lastAI = [...allMessages].reverse().find(m => m._getType?.() === "ai");
    const finalText = typeof lastAI?.content === "string"
      ? lastAI.content
      : lastAI?.content?.map(c => c.text ?? "").join("") ?? "";

    // ── Save assistant message ──────────────────────────────────────────────

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, is_agent, sender_display_name)
       VALUES ($1, 'assistant', $2, true, 'Travel Agent')`,
      [conversation_id, finalText]
    );

    log({ handler: "invoke_complete", conversation_id, responseLength: finalText.length });

    return respond(200, { ok: true });

  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), handler: "error", message: err.message, stack: err.stack }));
    return respond(500, { error: "Internal server error" });
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
    body: JSON.stringify(body),
  };
}
