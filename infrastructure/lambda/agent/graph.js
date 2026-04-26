import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import OpenAI from "openai";
import { getPool } from "./db.js";

// ── Constants (preserved from original index.ts) ─────────────────────────────

const EMBEDDING_MODEL   = "text-embedding-3-small";
const GEMINI_MODEL      = "gemini-2.5-flash";
const SIMILARITY_CUTOFF = 0.2;
const MAX_ITERATIONS    = 5;

// ── Structured JSON logging ───────────────────────────────────────────────────

export function log(data) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...data }));
}

// ── Embedding ─────────────────────────────────────────────────────────────────

let _openai = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

async function embedText(text) {
  const resp = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input: text });
  return resp.data[0].embedding;
}

// ── pgvector search ───────────────────────────────────────────────────────────

async function matchReviews(embedding, city, count, category) {
  const candidateCount = Math.min(Math.max(count * 3, 20), 60);
  const pool = await getPool();

  // Pass embedding as a Postgres array literal; pg driver sends it as text
  const embeddingLiteral = `[${embedding.join(",")}]`;
  const { rows } = await pool.query(
    "SELECT id, location_name, source, content, rating, category, similarity FROM match_reviews($1::vector, $2, $3)",
    [embeddingLiteral, city, candidateCount]
  );

  const seen = new Set();
  const filtered = [];
  for (const row of rows) {
    if (row.similarity < SIMILARITY_CUTOFF) continue;
    if (category && row.category?.toLowerCase() !== category.toLowerCase()) continue;
    const key = `${row.source}|${row.location_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(row);
    if (filtered.length >= count) break;
  }
  return filtered;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function formatProfile(prefs) {
  if (!prefs) return "";
  const lines = [
    prefs.budget        && `Budget: ${prefs.budget}`,
    prefs.destination   && `Destination: ${prefs.destination}`,
    prefs.trip_style    && `Trip style: ${prefs.trip_style}`,
    prefs.pace_morning  && `Morning pace: ${prefs.pace_morning}`,
    prefs.pace_evening  && `Evening pace: ${prefs.pace_evening}`,
    prefs.downtime      && `Downtime preference: ${prefs.downtime}`,
    prefs.accommodation && `Accommodation: ${prefs.accommodation}`,
    prefs.dietary?.length && `Dietary: ${Array.isArray(prefs.dietary) ? prefs.dietary.join(", ") : prefs.dietary}`,
  ].filter(Boolean);
  return lines.join("\n");
}

function formatReviews(reviews) {
  if (!reviews?.length) return "(no reviews retrieved yet)";
  return reviews
    .map(r => `[${(r.source ?? "UNKNOWN").toUpperCase()}] ${r.location_name} — ${r.rating ?? "?"}★ (${r.category ?? "general"})\n${r.content}`)
    .join("\n\n");
}

function buildSystemPrompt(state) {
  const base = state.user_preferences?.__isGroup
    ? `You are a knowledgeable and friendly AI travel agent participating in a group travel planning chat. You were invoked by ${state.user_preferences.__invoker ?? "a group member"} using @travel-agent. Your goal is to plan a trip that works for everyone — flag any conflicts (dietary, budget) proactively.\n\n${state.user_preferences.__block}`
    : `You are a knowledgeable and friendly AI travel agent. Help users plan their trips with personalized recommendations.\n\n${state.user_preferences?.__block ?? ""}`;

  const rag = `\nYou have access to a real traveler reviews database. Always call search_reviews to ground recommendations. If search_reviews returns 0 results for a city, call scrape_city_reviews to populate the database before searching again. Use create_itinerary to build a day-by-day plan when the user is ready.`;

  const reviewsSection = state.retrieved_reviews?.length
    ? `\n\nRELEVANT REVIEWS:\n${formatReviews(state.retrieved_reviews)}`
    : "";

  return base + rag + reviewsSection;
}

// ── Tool definitions (mirrors original TOOL_DECLARATIONS) ─────────────────────

const searchReviewsTool = tool(
  async () => ({}), // execution handled by searchReviews node
  {
    name: "search_reviews",
    description: "Search real traveler reviews for restaurants, hotels, attractions, and activities in a specific city. Always use this to ground recommendations in real experiences.",
    schema: z.object({
      query:    z.string().describe("What to search for, e.g. 'best hiking trails' or 'budget hotels'"),
      city:     z.string().describe("The city to search reviews for, lowercase (e.g. 'maui', 'tokyo')"),
      count:    z.number().optional().describe("Number of reviews to retrieve (default 8, max 15)"),
      category: z.string().optional().describe("Optional filter: restaurant | hotel | attraction | activity | beach"),
    }),
  }
);

const createItineraryTool = tool(
  async () => ({}), // execution handled by generateItinerary node
  {
    name: "create_itinerary",
    description: "Create a structured day-by-day travel itinerary based on retrieved reviews and user preferences.",
    schema: z.object({
      destination: z.string().describe("The destination city or region"),
      days:        z.number().describe("Number of days for the itinerary"),
      preferences: z.string().optional().describe("Travel style or special requests"),
    }),
  }
);

const scrapeCityReviewsTool = tool(
  async () => ({}), // execution handled by scrapeCityReviews node
  {
    name: "scrape_city_reviews",
    description: "Scrape and ingest real traveler reviews from Google Places for a city not yet in the database. Use when search_reviews returns 0 results. Returns number of reviews ingested.",
    schema: z.object({
      city: z.string().describe("The city to scrape, lowercase (e.g. 'tokyo', 'barcelona')"),
    }),
  }
);

// ── State schema ──────────────────────────────────────────────────────────────

export const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  retrieved_reviews: Annotation({
    reducer: (_, y) => y,
    default: () => [],
  }),
  user_preferences: Annotation({
    reducer: (_, y) => y,
    default: () => null,
  }),
  destination: Annotation({
    reducer: (_, y) => y,
    default: () => "maui",
  }),
  itinerary_draft: Annotation({
    reducer: (_, y) => y,
    default: () => null,
  }),
  search_queries_tried: Annotation({
    reducer: (x, y) => [...x, ...(Array.isArray(y) ? y : [y])],
    default: () => [],
  }),
  iteration_count: Annotation({
    reducer: (x, y) => x + (y ?? 0),
    default: () => 0,
  }),
});

// ── Node: retrieve_context ────────────────────────────────────────────────────

async function retrieveContext(state) {
  const lastHuman = [...state.messages].reverse().find(m => m._getType?.() === "human");
  const query = typeof lastHuman?.content === "string" ? lastHuman.content : "";

  const embedding = await embedText(query);
  const reviews   = await matchReviews(embedding, state.destination, 15, undefined);

  log({ node: "retrieve_context", destination: state.destination, reviewCount: reviews.length, iteration_count: state.iteration_count });

  return { retrieved_reviews: reviews };
}

// ── Node: reason ──────────────────────────────────────────────────────────────

async function reason(state) {
  const model = new ChatGoogleGenerativeAI({
    model:  GEMINI_MODEL,
    apiKey: process.env.GEMINI_API_KEY,
  }).bindTools([searchReviewsTool, createItineraryTool, scrapeCityReviewsTool]);

  const systemPrompt = buildSystemPrompt(state);
  const response = await model.invoke([
    new SystemMessage(systemPrompt),
    ...state.messages,
  ]);

  const tokenUsage = response.usage_metadata ?? {};
  log({
    node:          "reason",
    toolCalls:     response.tool_calls?.length ?? 0,
    inputTokens:   tokenUsage.input_tokens,
    outputTokens:  tokenUsage.output_tokens,
    iteration_count: state.iteration_count + 1,
  });

  return {
    messages:        [response],
    iteration_count: 1,
  };
}

// ── Node: search_reviews ──────────────────────────────────────────────────────

async function searchReviews(state) {
  const lastAI  = [...state.messages].reverse().find(m => m._getType?.() === "ai");
  const tc      = lastAI?.tool_calls?.[0];
  const args    = tc?.args ?? {};
  const query   = args.query ?? "";
  const city    = (args.city ?? state.destination).toLowerCase();
  const count   = Math.min(args.count ?? 8, 15);
  const category = args.category;

  const embedding  = await embedText(query);
  const newReviews = await matchReviews(embedding, city, count, category);

  // Merge with existing retrieved_reviews, dedup by id
  const existingIds = new Set((state.retrieved_reviews ?? []).map(r => r.id));
  const merged = [
    ...(state.retrieved_reviews ?? []),
    ...newReviews.filter(r => !existingIds.has(r.id)),
  ];

  const resultText = newReviews.length
    ? `Found ${newReviews.length} reviews for "${query}" in ${city}:\n\n${formatReviews(newReviews)}`
    : `No reviews found for "${query}" in ${city}.`;

  log({ node: "search_reviews", query, city, newReviewCount: newReviews.length, totalReviews: merged.length, iteration_count: state.iteration_count });

  return {
    messages:             [new ToolMessage({ content: resultText, tool_call_id: tc?.id ?? "search" })],
    retrieved_reviews:    merged,
    search_queries_tried: [query],
  };
}

// ── Node: scrape_city_reviews ─────────────────────────────────────────────────

async function scrapeCityReviews(state) {
  const lastAI = [...state.messages].reverse().find(m => m._getType?.() === "ai");
  const tc     = lastAI?.tool_calls?.[0];
  const city   = (tc?.args?.city ?? state.destination).toLowerCase();
  log({ node: "scrape_city_reviews", city, iteration_count: state.iteration_count });
  let resultText;
  try {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
      resultText = `Google Places API key not configured. Cannot scrape reviews for ${city}.`;
    } else {
      const { scrapeCityReviews: runScraper } = await import("./scraper.js");
      const result = await runScraper(city, { embedText, getPool, log });
      resultText = `Scraped and ingested ${result.inserted} new reviews for ${city} (${result.updated} updated). You can now call search_reviews for ${city}.`;
    }
  } catch (err) {
    log({ node: "scrape_city_reviews", error: err.message, city });
    resultText = `Failed to scrape reviews for ${city}: ${err.message}.`;
  }
  return {
    messages: [new ToolMessage({ content: resultText, tool_call_id: tc?.id ?? "scrape" })],
  };
}

// ── Node: generate_itinerary ──────────────────────────────────────────────────

async function generateItinerary(state) {
  const lastAI = [...state.messages].reverse().find(m => m._getType?.() === "ai");
  const tc     = lastAI?.tool_calls?.[0];
  const args   = tc?.args ?? {};

  const model = new ChatGoogleGenerativeAI({
    model:  GEMINI_MODEL,
    apiKey: process.env.GEMINI_API_KEY,
  });

  const profileText  = state.user_preferences?.__block ?? "";
  const reviewsText  = formatReviews(state.retrieved_reviews);
  const prompt = [
    `Create a detailed ${args.days ?? 3}-day itinerary for ${args.destination ?? state.destination}.`,
    args.preferences ? `Traveler preferences: ${args.preferences}` : "",
    profileText ? `User profile:\n${profileText}` : "",
    `Base your recommendations on these real traveler reviews:\n${reviewsText}`,
    "Structure it as Day 1 / Day 2 / etc. with Morning, Afternoon, Evening sections. Include specific place names from the reviews.",
  ].filter(Boolean).join("\n\n");

  const response     = await model.invoke([new HumanMessage(prompt)]);
  const itinerary    = typeof response.content === "string" ? response.content : response.content.map(c => c.text ?? "").join("");

  log({ node: "generate_itinerary", destination: args.destination ?? state.destination, days: args.days, iteration_count: state.iteration_count });

  return {
    messages:       [new ToolMessage({ content: itinerary, tool_call_id: tc?.id ?? "itinerary" })],
    itinerary_draft: itinerary,
  };
}

// ── Node: synthesize ──────────────────────────────────────────────────────────

async function synthesize(state) {
  let finalText;

  const lastMessage = state.messages[state.messages.length - 1];
  const lastMsgType = lastMessage?._getType?.();

  if (lastMsgType === "tool" || state.itinerary_draft) {
    // Came from generate_itinerary — ask Gemini to present the itinerary as a friendly response
    const model = new ChatGoogleGenerativeAI({
      model:  GEMINI_MODEL,
      apiKey: process.env.GEMINI_API_KEY,
    });
    const response = await model.invoke([
      new SystemMessage(buildSystemPrompt(state)),
      ...state.messages,
    ]);
    finalText = typeof response.content === "string"
      ? response.content
      : response.content.map(c => c.text ?? "").join("");

    const tokenUsage = response.usage_metadata ?? {};
    log({ node: "synthesize", path: "generate", totalTokens: (tokenUsage.input_tokens ?? 0) + (tokenUsage.output_tokens ?? 0), iteration_count: state.iteration_count });
  } else {
    // Came from reason done path — last AIMessage already has the final text.
    // If the last AI message only has tool_calls and no text (max-iterations forced
    // this route mid-tool-call), fall back to a fresh Gemini call.
    const lastAI = [...state.messages].reverse().find(m => m._getType?.() === "ai");
    const content = lastAI?.content;
    const extracted = typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.filter(c => c.type === "text").map(c => c.text ?? "").join("")
        : "";

    if (extracted.trim()) {
      finalText = extracted;
      log({ node: "synthesize", path: "done", responseLength: finalText.length, iteration_count: state.iteration_count });
    } else {
      // Forced here with no text — generate a best-effort response from current state
      const model = new ChatGoogleGenerativeAI({
        model:  GEMINI_MODEL,
        apiKey: process.env.GEMINI_API_KEY,
      });
      const response = await model.invoke([
        new SystemMessage(buildSystemPrompt(state)),
        ...state.messages,
        new HumanMessage("Please give your best travel recommendations based on what you know, even without specific reviews."),
      ]);
      finalText = typeof response.content === "string"
        ? response.content
        : response.content.map(c => c.text ?? "").join("");
      log({ node: "synthesize", path: "fallback", responseLength: finalText.length, iteration_count: state.iteration_count });
    }
  }

  return {
    messages: [new AIMessage(finalText)],
  };
}

// ── Edge: should_continue ─────────────────────────────────────────────────────

function shouldContinue(state) {
  if (state.iteration_count >= MAX_ITERATIONS) {
    log({ node: "should_continue", decision: "synthesize", reason: "max_iterations_reached", iteration_count: state.iteration_count });
    return "synthesize";
  }

  const lastAI = [...state.messages].reverse().find(m => m._getType?.() === "ai");
  const toolName = lastAI?.tool_calls?.[0]?.name;

  const decision = toolName === "search_reviews"      ? "search_reviews"
                 : toolName === "create_itinerary"    ? "generate_itinerary"
                 : toolName === "scrape_city_reviews" ? "scrape_city_reviews"
                 :                                      "synthesize";

  log({ node: "should_continue", decision, toolName: toolName ?? "none", iteration_count: state.iteration_count });
  return decision;
}

// ── Graph factory ─────────────────────────────────────────────────────────────

export function createGraph(checkpointer, onStatus = () => {}) {
  const graph = new StateGraph(AgentState)
    .addNode("retrieve_context",    retrieveContext)
    .addNode("reason",              reason)
    .addNode("search_reviews",      (s) => { onStatus("Searching reviews..."); return searchReviews(s); })
    .addNode("scrape_city_reviews", (s) => {
      const tc   = [...s.messages].reverse().find(m => m._getType?.() === "ai")?.tool_calls?.[0];
      const city = (tc?.args?.city ?? s.destination).toLowerCase();
      onStatus(`Scraping reviews for ${city}...`);
      return scrapeCityReviews(s);
    })
    .addNode("generate_itinerary",  (s) => { onStatus("Building your itinerary..."); return generateItinerary(s); })
    .addNode("synthesize",          (s) => { onStatus("Writing response..."); return synthesize(s); })
    .addEdge(START,                "retrieve_context")
    .addEdge("retrieve_context",   "reason")
    .addConditionalEdges("reason", shouldContinue, {
      search_reviews:      "search_reviews",
      generate_itinerary:  "generate_itinerary",
      scrape_city_reviews: "scrape_city_reviews",
      synthesize:          "synthesize",
    })
    .addEdge("search_reviews",      "reason")
    .addEdge("scrape_city_reviews", "reason")
    .addEdge("generate_itinerary",  "synthesize")
    .addEdge("synthesize",          END);

  return graph.compile({ checkpointer });
}
