import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import pg from "pg";

const { Pool } = pg;

// ── DB singleton ──────────────────────────────────────────────────────────────

let _secret = null;
let _pool   = null;

async function getSecret() {
  if (_secret) return _secret;
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const resp   = await client.send(new GetSecretValueCommand({ SecretId: process.env.AWS_SECRET_NAME }));
  _secret = JSON.parse(resp.SecretString);
  return _secret;
}

async function getPool() {
  if (_pool) return _pool;
  const s = await getSecret();
  _pool = new Pool({
    host: s.host, port: Number(s.port ?? 5432),
    database: s.dbname, user: s.username, password: s.password,
    ssl: { rejectUnauthorized: false }, max: 3,
    idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000,
  });
  return _pool;
}

// ── Cognito JWT verification ───────────────────────────────────────────────────

const _region     = process.env.AWS_REGION     ?? "us-east-1";
const _userPoolId = process.env.COGNITO_USER_POOL_ID;

const _jwks = jwksClient({
  jwksUri: `https://cognito-idp.${_region}.amazonaws.com/${_userPoolId}/.well-known/jwks.json`,
  cache: true, rateLimit: true,
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

async function getUserId(event) {
  const auth  = event.headers?.Authorization ?? event.headers?.authorization ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  try {
    const payload = await verifyToken(token);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// ── CORS response helper ──────────────────────────────────────────────────────

function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type":                 "application/json",
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function getProfile(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  const result = await pool.query("SELECT * FROM user_profiles WHERE id=$1", [userId]);
  if (!result.rows.length) return respond(404, { error: "Profile not found" });
  return respond(200, result.rows[0]);
}

async function getProfileById(event, profileUserId) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  const result = await pool.query("SELECT * FROM user_profiles WHERE id=$1", [profileUserId]);
  if (!result.rows.length) return respond(404, { error: "Profile not found" });
  return respond(200, result.rows[0]);
}

async function putProfile(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  let body;
  try { body = JSON.parse(event.body ?? "{}"); } catch { return respond(400, { error: "Invalid JSON" }); }

  const pool = await getPool();
  const result = await pool.query(
    `INSERT INTO user_profiles
       (id, email, display_name, budget, destination, trip_style,
        pace_morning, pace_evening, downtime, accommodation, dietary, onboarding_complete)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)
     ON CONFLICT (id) DO UPDATE SET
       email               = COALESCE(EXCLUDED.email, user_profiles.email),
       display_name        = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
       budget              = COALESCE(EXCLUDED.budget, user_profiles.budget),
       destination         = COALESCE(EXCLUDED.destination, user_profiles.destination),
       trip_style          = COALESCE(EXCLUDED.trip_style, user_profiles.trip_style),
       pace_morning        = COALESCE(EXCLUDED.pace_morning, user_profiles.pace_morning),
       pace_evening        = COALESCE(EXCLUDED.pace_evening, user_profiles.pace_evening),
       downtime            = COALESCE(EXCLUDED.downtime, user_profiles.downtime),
       accommodation       = COALESCE(EXCLUDED.accommodation, user_profiles.accommodation),
       dietary             = COALESCE(EXCLUDED.dietary, user_profiles.dietary),
       onboarding_complete = true
     RETURNING *`,
    [
      userId,
      body.email        ?? null,
      body.display_name ?? null,
      body.budget       ?? null,
      body.destination  ?? null,
      body.trip_style   ?? null,
      body.pace_morning ?? null,
      body.pace_evening ?? null,
      body.downtime     ?? null,
      body.accommodation ?? null,
      body.dietary      ?? null,
    ]
  );
  return respond(200, result.rows[0]);
}

async function getConversations(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });

  const pool = await getPool();
  const [soloRes, groupRes] = await Promise.all([
    pool.query(
      `SELECT * FROM conversations WHERE user_id=$1 AND is_group=false ORDER BY created_at DESC`,
      [userId]
    ),
    pool.query(
      `SELECT c.*,
              json_agg(json_build_object('user_id', gm.user_id, 'display_name', gm.display_name)) AS group_members
       FROM conversations c
       JOIN group_members gm ON c.id = gm.conversation_id
       WHERE gm.user_id=$1 AND c.is_group=true
       GROUP BY c.id ORDER BY c.created_at DESC`,
      [userId]
    ),
  ]);
  return respond(200, { solo: soloRes.rows, groups: groupRes.rows });
}

async function createConversation(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  const result = await pool.query(
    `INSERT INTO conversations (user_id, title) VALUES ($1, 'New Conversation') RETURNING *`,
    [userId]
  );
  return respond(201, result.rows[0]);
}

async function createGroupConversation(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  let body;
  try { body = JSON.parse(event.body ?? "{}"); } catch { return respond(400, { error: "Invalid JSON" }); }
  const groupName = (body.group_name ?? "").trim();
  if (!groupName) return respond(400, { error: "group_name required" });

  const pool = await getPool();
  const { rows: [row] } = await pool.query(
    "SELECT create_group_conversation($1) AS id", [groupName]
  );
  const convId = row.id;

  // Fetch user's display_name to store in group_members
  const profileRes = await pool.query("SELECT display_name FROM user_profiles WHERE id=$1", [userId]);
  const displayName = profileRes.rows[0]?.display_name ?? null;

  await pool.query(
    "INSERT INTO group_members (conversation_id, user_id, display_name) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
    [convId, userId, displayName]
  );

  return respond(201, { id: convId, group_name: groupName, is_group: true });
}

async function getMessages(event, conversationId) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  const result = await pool.query(
    "SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at ASC",
    [conversationId]
  );
  return respond(200, result.rows);
}

async function createMessage(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  let body;
  try { body = JSON.parse(event.body ?? "{}"); } catch { return respond(400, { error: "Invalid JSON" }); }

  const {
    conversation_id, role = "user", content,
    is_agent = false, sender_display_name, attachments,
  } = body;

  const pool   = await getPool();
  const result = await pool.query(
    `INSERT INTO messages
       (conversation_id, role, content, is_agent, sender_id, sender_display_name, attachments)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [conversation_id, role, content, is_agent, userId, sender_display_name, attachments ? JSON.stringify(attachments) : null]
  );
  return respond(201, result.rows[0]);
}

async function getGroupMembers(event, conversationId) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  const result = await pool.query(
    "SELECT user_id, display_name FROM get_group_members($1)", [conversationId]
  );
  return respond(200, result.rows);
}

async function lookupUserByEmail(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  let body;
  try { body = JSON.parse(event.body ?? "{}"); } catch { return respond(400, { error: "Invalid JSON" }); }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return respond(400, { error: "email required" });

  const pool   = await getPool();
  const result = await pool.query(
    "SELECT id AS user_id, display_name FROM user_profiles WHERE LOWER(email)=$1",
    [email]
  );
  return respond(200, result.rows);
}

async function getInvites(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  const result = await pool.query(
    `SELECT gi.*, c.group_name
     FROM group_invites gi
     JOIN conversations c ON c.id = gi.conversation_id
     WHERE gi.invited_user_id=$1 AND gi.status='pending'`,
    [userId]
  );
  return respond(200, result.rows);
}

async function createInvite(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  let body;
  try { body = JSON.parse(event.body ?? "{}"); } catch { return respond(400, { error: "Invalid JSON" }); }

  const { conversation_id, invited_user_id, inviter_display_name } = body;
  if (!conversation_id || !invited_user_id) return respond(400, { error: "conversation_id and invited_user_id required" });

  const pool = await getPool();
  try {
    await pool.query(
      `INSERT INTO group_invites (conversation_id, invited_by, invited_user_id, inviter_display_name)
       VALUES ($1,$2,$3,$4)`,
      [conversation_id, userId, invited_user_id, inviter_display_name ?? null]
    );
  } catch (e) {
    if (e.code === "23505") return respond(409, { error: "Invite already sent." });
    throw e;
  }
  return respond(201, { ok: true });
}

async function acceptInvite(event, inviteId) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  await pool.query("SELECT accept_group_invite($1)", [inviteId]);
  return respond(200, { ok: true });
}

async function declineInvite(event, inviteId) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  const pool   = await getPool();
  await pool.query("SELECT decline_group_invite($1)", [inviteId]);
  return respond(200, { ok: true });
}

async function postUpload(event) {
  const userId = await getUserId(event);
  if (!userId) return respond(401, { error: "Unauthorized" });
  let body;
  try { body = JSON.parse(event.body ?? "{}"); } catch { return respond(400, { error: "Invalid JSON" }); }

  const { filename, mime_type = "application/octet-stream" } = body;
  if (!filename) return respond(400, { error: "filename required" });

  const bucket = process.env.ATTACHMENTS_BUCKET;
  const region = process.env.AWS_REGION ?? "us-east-1";
  const key    = `${randomUUID()}-${filename}`;
  const s3     = new S3Client({ region });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mime_type }),
    { expiresIn: 300 }
  );
  return respond(200, { upload_url: uploadUrl, key, public_url: `https://${bucket}.s3.${region}.amazonaws.com/${key}` });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function handler(event) {
  const method  = event.httpMethod;
  const rawPath = (event.path ?? "").replace(/\/$/, "") || "/";

  if (method === "OPTIONS") return respond(200, {});

  try {
    if (method === "GET"  && rawPath === "/profile")                                     return await getProfile(event);
    if (method === "PUT"  && rawPath === "/profile")                                     return await putProfile(event);
    if (method === "GET"  && /^\/profile\/[^/]+$/.test(rawPath))                        return await getProfileById(event, rawPath.split("/")[2]);
    if (method === "GET"  && rawPath === "/conversations")                               return await getConversations(event);
    if (method === "POST" && rawPath === "/conversations")                               return await createConversation(event);
    if (method === "POST" && rawPath === "/conversations/group")                         return await createGroupConversation(event);
    if (method === "GET"  && /^\/messages\/[^/]+$/.test(rawPath))                       return await getMessages(event, rawPath.split("/")[2]);
    if (method === "POST" && rawPath === "/messages")                                    return await createMessage(event);
    if (method === "GET"  && /^\/group-members\/[^/]+$/.test(rawPath))                 return await getGroupMembers(event, rawPath.split("/")[2]);
    if (method === "POST" && rawPath === "/users/lookup")                                return await lookupUserByEmail(event);
    if (method === "GET"  && rawPath === "/invites")                                     return await getInvites(event);
    if (method === "POST" && rawPath === "/invites")                                     return await createInvite(event);
    if (method === "POST" && /^\/invites\/[^/]+\/accept$/.test(rawPath))               return await acceptInvite(event, rawPath.split("/")[2]);
    if (method === "POST" && /^\/invites\/[^/]+\/decline$/.test(rawPath))              return await declineInvite(event, rawPath.split("/")[2]);
    if (method === "POST" && rawPath === "/upload")                                      return await postUpload(event);
    return respond(404, { error: "Not found" });
  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), error: err.message, stack: err.stack }));
    return respond(500, { error: "Internal server error" });
  }
}
