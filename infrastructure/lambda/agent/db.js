import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const { Pool } = pg;

let _secret = null;
let _pool = null;
let _checkpointer = null;
let _checkpointerReady = false;

export async function getSecret() {
  if (_secret) return _secret;

  const client = new SecretsManagerClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.AWS_SECRET_NAME })
  );
  _secret = JSON.parse(response.SecretString);
  return _secret;
}

export async function getPool() {
  if (_pool) return _pool;

  // DATABASE_URL lets local tests connect through an SSH tunnel without Secrets Manager.
  // Set it to postgres://user:pass@localhost:5433/juntos when using SSM/bastion port-forward.
  if (process.env.DATABASE_URL) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    return _pool;
  }

  const secret = await getSecret();
  _pool = new Pool({
    host:     secret.host,
    port:     Number(secret.port ?? 5432),
    database: secret.dbname,
    user:     secret.username,
    password: secret.password,
    ssl:      { rejectUnauthorized: false },
    max:      5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return _pool;
}

export async function getCheckpointer() {
  if (_checkpointer) return _checkpointer;

  const pool = await getPool();
  _checkpointer = new PostgresSaver(pool);

  if (!_checkpointerReady) {
    await _checkpointer.setup();
    _checkpointerReady = true;
  }

  return _checkpointer;
}
