import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from "@aws-sdk/client-apigatewaymanagementapi";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
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

// ── Logging ───────────────────────────────────────────────────────────────────

function log(data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...data }));
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleConnect(event) {
  const connectionId   = event.requestContext.connectionId;
  const qs             = event.queryStringParameters ?? {};
  const conversationId = qs.conversation_id;
  const token          = qs.token;

  if (!conversationId) {
    log({ route: "$connect", error: "missing conversation_id", connectionId });
    return { statusCode: 400, body: "conversation_id required" };
  }

  let userId = null;
  try {
    const payload = await verifyToken(token);
    userId = payload.sub ?? null;
  } catch {
    // Allow connection without valid token — userId stored as null
    log({ route: "$connect", warning: "token verification failed", connectionId });
  }

  const pool = await getPool();
  await pool.query(
    `INSERT INTO websocket_connections (connection_id, conversation_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (connection_id) DO UPDATE SET conversation_id=$2, user_id=$3, created_at=NOW()`,
    [connectionId, conversationId, userId]
  );

  log({ route: "$connect", connectionId, conversationId, userId });
  return { statusCode: 200, body: "Connected" };
}

async function handleDisconnect(event) {
  const connectionId = event.requestContext.connectionId;
  const pool         = await getPool();
  await pool.query("DELETE FROM websocket_connections WHERE connection_id=$1", [connectionId]);
  log({ route: "$disconnect", connectionId });
  return { statusCode: 200, body: "Disconnected" };
}

async function handleMessage(event) {
  const connectionId = event.requestContext.connectionId;
  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { conversation_id, payload } = body;
  if (!conversation_id || payload === undefined) {
    return { statusCode: 400, body: "conversation_id and payload required" };
  }

  const pool   = await getPool();
  const result = await pool.query(
    "SELECT connection_id FROM websocket_connections WHERE conversation_id=$1",
    [conversation_id]
  );

  const endpoint = process.env.WEBSOCKET_API_ENDPOINT;
  const mgmt     = new ApiGatewayManagementApiClient({ endpoint });
  const data     = Buffer.from(JSON.stringify(payload));

  const stale = [];
  await Promise.allSettled(
    result.rows.map(async ({ connection_id }) => {
      try {
        await mgmt.send(new PostToConnectionCommand({ ConnectionId: connection_id, Data: data }));
      } catch (err) {
        if (err.statusCode === 410) stale.push(connection_id);
        else log({ route: "message", error: err.message, connection_id });
      }
    })
  );

  if (stale.length) {
    await pool.query(
      "DELETE FROM websocket_connections WHERE connection_id = ANY($1::text[])",
      [stale]
    );
  }

  log({ route: "message", connectionId, conversation_id, recipients: result.rows.length, staleRemoved: stale.length });
  return { statusCode: 200, body: "Message sent" };
}

async function handleAgentMessage(event) {
  const connectionId = event.requestContext.connectionId;
  let body;
  try {
    body = JSON.parse(event.body ?? "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { conversation_id, user_message, is_group, sender_display_name, attachments } = body;
  if (!conversation_id || !user_message) {
    return { statusCode: 400, body: "conversation_id and user_message required" };
  }

  // Retrieve userId stored when client connected ($connect handler)
  const pool = await getPool();
  const { rows } = await pool.query(
    "SELECT user_id FROM websocket_connections WHERE connection_id=$1",
    [connectionId]
  );
  const userId = rows[0]?.user_id;
  if (!userId) return { statusCode: 401, body: "Not authenticated" };

  // Async invoke — InvocationType:Event returns immediately; Agent Lambda runs independently
  const lambda = new LambdaClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  await lambda.send(new InvokeCommand({
    FunctionName:   process.env.AGENT_LAMBDA_NAME,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify({
      connectionId,
      userId,
      conversation_id,
      user_message,
      is_group:             is_group ?? false,
      sender_display_name:  sender_display_name ?? null,
      attachments:          attachments ?? null,
      wsEndpoint:           process.env.WEBSOCKET_API_ENDPOINT,
    })),
  }));

  log({ route: "agent", connectionId, conversation_id, userId });
  return { statusCode: 200, body: "Agent invoked" };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function handler(event) {
  const route = event.requestContext?.routeKey;
  try {
    if (route === "$connect")    return await handleConnect(event);
    if (route === "$disconnect") return await handleDisconnect(event);
    if (route === "message")     return await handleMessage(event);
    if (route === "agent")       return await handleAgentMessage(event);
    return { statusCode: 400, body: `Unknown route: ${route}` };
  } catch (err) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), route, error: err.message, stack: err.stack }));
    return { statusCode: 500, body: "Internal server error" };
  }
}
