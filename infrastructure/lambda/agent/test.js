/**
 * Local test script — streams each node transition to stdout.
 *
 * RDS is in a private subnet, so set DATABASE_URL to a tunnel before running:
 *
 *   # Option A — SSM port-forward (no bastion needed):
 *   aws ssm start-session \
 *     --target <ec2-instance-id> \
 *     --document-name AWS-StartPortForwardingSessionToRemoteHost \
 *     --parameters "host=juntos-postgres.c2fqgwg64htk.us-east-1.rds.amazonaws.com,portNumber=5432,localPortNumber=5433"
 *
 *   # Option B — SSH bastion:
 *   ssh -L 5433:juntos-postgres.c2fqgwg64htk.us-east-1.rds.amazonaws.com:5432 ec2-user@<bastion-ip>
 *
 *   # Then in a new terminal (get the password from Secrets Manager first):
 *   export DB_PASS=$(aws secretsmanager get-secret-value \
 *     --secret-id juntos/rds/master-credentials --region us-east-1 \
 *     --query SecretString --output text | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")
 *   export DATABASE_URL="postgres://juntos_admin:${DB_PASS}@localhost:5433/juntos"
 *   node test.js
 */

import path from "path";
import { fileURLToPath } from "url";
import { config as loadDotenv } from "dotenv";

// Load .env from repo root (3 levels up: agent/ → lambda/ → infrastructure/ → repo root)
const __dirname = fileURLToPath(new URL(".", import.meta.url));
loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  console.error(
    "DATABASE_URL is not set.\n" +
    "RDS is in a private subnet — set up an SSH tunnel or SSM port-forward first.\n" +
    "See the comment at the top of this file for instructions."
  );
  process.exit(1);
}

for (const key of ["GEMINI_API_KEY", "OPENAI_API_KEY"]) {
  if (!process.env[key]) {
    console.error(`Missing env var: ${key}`);
    process.exit(1);
  }
}

import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createGraph } from "./graph.js";

const CONVERSATION_ID = `test-${Date.now()}`;

const initialState = {
  messages:         [new HumanMessage("Plan me a 3 day Maui trip, I love hiking and I'm on a budget")],
  user_preferences: {
    __isGroup: false,
    __block:   "User Profile (from onboarding):\nBudget: budget\nDestination: maui\nTrip style: adventure\nPace: moderate",
  },
  destination: "maui",
};

const config = { configurable: { thread_id: CONVERSATION_ID } };

console.log("Starting agent test…");
console.log("Conversation ID:", CONVERSATION_ID);
console.log("Initial message:", initialState.messages[0].content);
console.log("─".repeat(60));

// MemorySaver keeps checkpoints in-process — no DB connection required for local testing.
// PostgresSaver is used automatically in Lambda via getCheckpointer() in handler.js.
const checkpointer = new MemorySaver();
const graph        = createGraph(checkpointer);

// Stream each node's output as it completes
for await (const chunk of await graph.stream(initialState, config)) {
  const [nodeName, nodeOutput] = Object.entries(chunk)[0];
  console.log(`\n── NODE: ${nodeName}`);

  if (nodeName === "retrieve_context") {
    const reviews = nodeOutput.retrieved_reviews ?? [];
    console.log(`   Reviews retrieved: ${reviews.length}`);
    if (reviews.length) console.log(`   First review: [${reviews[0].source}] ${reviews[0].location_name}`);
  } else if (nodeName === "reason") {
    const lastMsg = (nodeOutput.messages ?? []).at(-1);
    const toolCalls = lastMsg?.tool_calls ?? [];
    if (toolCalls.length) {
      console.log(`   Tool call: ${toolCalls[0].name}`);
      console.dir(toolCalls[0].args, { depth: 2 });
    } else {
      const preview = typeof lastMsg?.content === "string"
        ? lastMsg.content.slice(0, 200)
        : "(structured content)";
      console.log(`   Response preview: ${preview}…`);
    }
  } else if (nodeName === "search_reviews") {
    const msg = (nodeOutput.messages ?? []).at(-1);
    console.log(`   Tool result preview: ${(msg?.content ?? "").slice(0, 200)}…`);
  } else if (nodeName === "generate_itinerary") {
    console.log(`   Itinerary draft length: ${nodeOutput.itinerary_draft?.length ?? 0} chars`);
  } else if (nodeName === "synthesize") {
    const finalMsg = (nodeOutput.messages ?? []).at(-1);
    const text = typeof finalMsg?.content === "string" ? finalMsg.content : "";
    console.log(`\n${"═".repeat(60)}`);
    console.log("FINAL RESPONSE:");
    console.log("═".repeat(60));
    console.log(text);
    console.log("═".repeat(60));
  }
}

// Tear down the pg pool so the process exits cleanly
const { getPool } = await import("./db.js");
try {
  const pool = await getPool();
  await pool.end();
} catch { /* pool may not have been initialised if all nodes failed */ }
