import { HumanMessage } from "@langchain/core/messages";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
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
  // WebSocket async mode — invoked by websocket Lambda with InvocationType:Event
  if (event.connectionId) {
    return handleWebSocket(event);
  }
  // REST mode — invoked synchronously by API Gateway (unchanged)
  return handleRest(event);
}

// ── Shared: load profile and build userPreferences + destination ──────────────

async function loadContext(pool, userId, conversationId, isGroup, senderDisplayName) {
  let userPreferences = null;
  let destination     = "maui";

  if (isGroup) {
    const membersRes = await pool.query(
      "SELECT user_id FROM group_members WHERE conversation_id = $1",
      [conversationId]
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
        const profile = profileMap[id] ?? {};
        const name    = id === userId
          ? `${senderDisplayName ?? profile.display_name ?? "Unknown"} (invoked @travel-agent)`
          : profile.display_name ?? "Unknown";
        return `${name}:\n${formatProfile(profile) || "(no preferences set)"}`;
      }).join("\n\n");
    }

    userPreferences = { __isGroup: true, __block: profileBlock, __invoker: senderDisplayName };
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

  return { userPreferences, destination };
}

// ── Shared: run graph and extract final text ──────────────────────────────────

async function runGraph(conversationId, userMessage, userPreferences, destination, onStatus) {
  const checkpointer = await getCheckpointer();
  const graph        = createGraph(checkpointer, onStatus);
  const config       = { configurable: { thread_id: conversationId } };

  const finalState = await graph.invoke(
    {
      messages:         [new HumanMessage(userMessage)],
      user_preferences: userPreferences,
      destination,
    },
    config
  );

  const allMessages = finalState.messages ?? [];
  const lastAI = [...allMessages].reverse().find(m => m._getType?.() === "ai");
  return typeof lastAI?.content === "string"
    ? lastAI.content
    : lastAI?.content?.map(c => c.text ?? "").join("") ?? "";
}

// ── WebSocket mode ────────────────────────────────────────────────────────────

async function handleWebSocket(event) {
  const {
    connectionId,
    userId,
    conversation_id,
    user_message,
    is_group         = false,
    sender_display_name,
    attachments,
    wsEndpoint,
  } = event;

  const push = async (data) => {
    const mgmt = new ApiGatewayManagementApiClient({ endpoint: wsEndpoint });
    try {
      await mgmt.send(new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data:         Buffer.from(JSON.stringify(data)),
      }));
    } catch (err) {
      // 410 = client disconnected; absorb silently
      if (err.$metadata?.httpStatusCode !== 410) throw err;
    }
  };

  try {
    const pool = await getPool();

    if (!is_group) {
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content, is_agent, attachments)
         VALUES ($1, 'user', $2, false, $3)`,
        [conversation_id, user_message, attachments ? JSON.stringify(attachments) : null]
      );
    }

    const { userPreferences, destination } = await loadContext(
      pool, userId, conversation_id, is_group, sender_display_name
    );

    const cleanedMessage = (user_message ?? "").replace(/^@travel-agent\s*/i, "").trim();

    log({ handler: "ws_invoke_start", conversation_id, userId, is_group, destination });
    await push({ type: "agent_status", status: "Thinking..." });

    const onStatus = (status) => push({ type: "agent_status", status });
    const finalText = await runGraph(conversation_id, cleanedMessage, userPreferences, destination, onStatus);

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, is_agent, sender_display_name)
       VALUES ($1, 'assistant', $2, true, 'Travel Agent')`,
      [conversation_id, finalText]
    );

    log({ handler: "ws_invoke_complete", conversation_id, responseLength: finalText.length });

    await push({
      type:    "agent_response",
      message: {
        id:                   crypto.randomUUID(),
        role:                 "assistant",
        content:              finalText,
        is_agent:             true,
        sender_display_name:  "Travel Agent",
        created_at:           new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), handler: "ws_error", message: err.message, stack: err.stack }));
    await push({ type: "agent_error", message: "Agent encountered an error. Please try again." }).catch(() => {});
  }
}

// ── REST mode (unchanged from original handler) ───────────────────────────────

async function handleRest(event) {
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

    const pool = await getPool();

    if (is_group) {
      const { rowCount } = await pool.query(
        "SELECT 1 FROM group_members WHERE conversation_id = $1 AND user_id = $2",
        [conversation_id, userId]
      );
      if (!rowCount) return respond(403, { error: "Not a member of this group" });
    }

    const cleanedMessage = (user_message ?? "").replace(/^@travel-agent\s*/i, "").trim();

    if (!is_group) {
      await pool.query(
        `INSERT INTO messages (conversation_id, role, content, is_agent, attachments)
         VALUES ($1, 'user', $2, false, $3)`,
        [conversation_id, user_message, attachments ? JSON.stringify(attachments) : null]
      );
    }

    const { userPreferences, destination } = await loadContext(
      pool, userId, conversation_id, is_group, sender_display_name
    );

    log({ handler: "rest_invoke_start", conversation_id, userId, is_group, destination });

    const finalText = await runGraph(conversation_id, cleanedMessage, userPreferences, destination, () => {});

    await pool.query(
      `INSERT INTO messages (conversation_id, role, content, is_agent, sender_display_name)
       VALUES ($1, 'assistant', $2, true, 'Travel Agent')`,
      [conversation_id, finalText]
    );

    log({ handler: "rest_invoke_complete", conversation_id, responseLength: finalText.length });

    return respond(200, { ok: true });

  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), handler: "rest_error", message: err.message, stack: err.stack }));
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
