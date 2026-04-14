import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function corsResponse(body: string | null, status = 200) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Gemini types (minimal)
// ---------------------------------------------------------------------------
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: unknown };
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content: GeminiContent;
  }>;
}

// ---------------------------------------------------------------------------
// Tool declarations
// ---------------------------------------------------------------------------
const TOOL_DECLARATIONS = [
  {
    name: "create_itinerary",
    description: "Create a structured day-by-day travel itinerary",
    parameters: {
      type: "object",
      properties: {
        destination: { type: "string" },
        days: { type: "number" },
        preferences: {
          type: "string",
          description: "Travel style and preferences",
        },
      },
      required: ["destination", "days"],
    },
  },
  {
    name: "search_reviews",
    description:
      "Search real traveler reviews for restaurants, hotels, attractions, and activities in a specific city. Use this when users ask about specific places, want recommendations backed by real experiences, or ask what locals and travelers think about a destination.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "What to search for, e.g. 'best ramen restaurants' or 'top beaches' or 'hidden gems'",
        },
        city: {
          type: "string",
          description:
            "The city to search reviews for, lowercase (e.g. 'maui', 'tokyo', 'paris')",
        },
        count: {
          type: "number",
          description: "Number of reviews to retrieve (default 8, max 15)",
        },
      },
      required: ["query", "city"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
function createItinerary(args: {
  destination: string;
  days: number;
  preferences?: string;
}) {
  const { destination, days, preferences = "balanced" } = args;
  const itinerary = [];
  for (let day = 1; day <= days; day++) {
    itinerary.push({
      day,
      morning:
        day === 1
          ? `Arrive in ${destination}, check in to hotel, grab a light breakfast at a local café.`
          : `Morning walk or jog around ${destination}'s scenic area. Visit a local market or bakery for breakfast.`,
      afternoon:
        day === 1
          ? `Orientation walk around central ${destination}. Visit the main square or waterfront.`
          : day % 2 === 0
          ? `Guided tour of ${destination}'s top historical sites and museums.`
          : `Free afternoon to explore neighborhoods, shopping, or a day trip nearby.`,
      evening:
        day === days
          ? `Farewell dinner at a highly-rated local restaurant. Pack and prepare for departure.`
          : `Dinner at a recommended local restaurant. Evening stroll or nightlife experience in ${destination}.`,
      notes: preferences
        ? `Tailored for: ${preferences}`
        : "Flexible — adjust based on energy and weather.",
    });
  }
  return {
    destination,
    days,
    preferences,
    itinerary,
    tips: [
      `Best local transport in ${destination}: check public transit apps or rent a bike.`,
      "Always carry a portable charger and a light rain jacket.",
      "Book popular restaurants and attractions in advance.",
    ],
  };
}

// ---------------------------------------------------------------------------
// RAG: search traveler reviews via pgvector
// ---------------------------------------------------------------------------
async function searchReviews(
  args: { query: string; city: string; count?: number },
  openaiApiKey: string | undefined,
  supabaseUrl: string,
  supabaseServiceKey: string
): Promise<unknown> {
  if (!openaiApiKey) {
    return { error: "Review search is not available (OPENAI_API_KEY not configured)" };
  }

  const city = args.city.toLowerCase().trim();
  const count = Math.min(args.count ?? 8, 15);

  // Embed the query with OpenAI text-embedding-3-small
  const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: args.query,
    }),
  });

  if (!embedRes.ok) {
    const errText = await embedRes.text();
    return { error: `Embedding API error: ${errText}` };
  }

  const embedData = await embedRes.json() as { data: Array<{ embedding: number[] }> };
  const queryEmbedding = embedData.data[0].embedding;

  // Call match_reviews RPC via Supabase REST API
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/match_reviews`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseServiceKey,
      "Authorization": `Bearer ${supabaseServiceKey}`,
    },
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      city_filter: city,
      match_count: count,
    }),
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    return { error: `Review retrieval error: ${errText}` };
  }

  const reviews = await rpcRes.json() as Array<{
    location_name: string;
    source: string;
    content: string;
    rating: number;
    category: string;
    similarity: number;
  }>;

  // Filter out low-relevance results
  const relevant = reviews.filter((r) => r.similarity >= 0.3);

  if (relevant.length === 0) {
    return {
      message: `No relevant reviews found for "${args.query}" in ${city}. The reviews database may not have data for this city yet.`,
      reviews: [],
    };
  }

  const formatted = relevant
    .map((r) => `[${r.source.toUpperCase()}] ${r.location_name} — ${r.rating}★ (${r.category})\n${r.content}`)
    .join("\n\n");

  return {
    city,
    query: args.query,
    review_count: relevant.length,
    reviews_text: `Relevant traveler reviews:\n\n${formatted}`,
  };
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------
async function callGemini(
  systemInstruction: string,
  contents: GeminiContent[],
  apiKey: string
): Promise<GeminiResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  return res.json() as Promise<GeminiResponse>;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // --- Environment variables ---
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://nigvyotnrlgbqeeyueql.supabase.co";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GEMINI_API_KEY) {
      return corsResponse(JSON.stringify({ error: "GEMINI_API_KEY not set" }), 500);
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return corsResponse(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }), 500);
    }

    // --- Supabase clients ---
    // Service role client for all DB ops and auth verification
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Parse body ---
    let body: { conversation_id: string; user_message: string; access_token: string };
    try {
      body = await req.json();
    } catch {
      return corsResponse(JSON.stringify({ error: "Invalid JSON body" }), 400);
    }
    const { conversation_id, user_message, access_token } = body;
    if (!conversation_id || !user_message) {
      return corsResponse(
        JSON.stringify({ error: "conversation_id and user_message are required" }),
        400
      );
    }

    // --- Authenticate user ---
    // Supabase's gateway verify_jwt only supports HS256 but new projects issue ES256 JWTs.
    // The frontend sends the anon key as the Bearer token (so the gateway accepts it),
    // and passes the user's actual JWT in the request body for server-side validation.
    if (!access_token) {
      return corsResponse(JSON.stringify({ error: "Missing access_token in body" }), 401);
    }
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(access_token);
    if (authError || !user) {
      return corsResponse(JSON.stringify({ error: "Invalid or expired token" }), 401);
    }
    const userId = user.id;

    // --- Save user message ---
    const { error: insertUserMsgError } = await serviceClient
      .from("messages")
      .insert({
        conversation_id,
        role: "user",
        content: user_message,
        is_agent: false,
        attachments: attachments.length > 0 ? attachments : null,
      });
    if (insertUserMsgError) {
      console.error("Failed to save user message:", insertUserMsgError);
    }

    // --- Load conversation history ---
    const { data: messageHistory, error: historyError } = await serviceClient
      .from("messages")
      .select("*")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true });
    if (historyError) {
      return corsResponse(JSON.stringify({ error: "Failed to load conversation history" }), 500);
    }

    // --- Load user profile ---
    const { data: userProfile } = await serviceClient
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    const budget = userProfile?.budget ?? "Not specified";
    const destination = userProfile?.destination ?? "Not specified";
    const trip_style = userProfile?.trip_style ?? "Not specified";
    const pace_morning = userProfile?.pace_morning ?? "Not specified";
    const pace_evening = userProfile?.pace_evening ?? "Not specified";
    const downtime = userProfile?.downtime ?? "Not specified";
    const accommodation = userProfile?.accommodation ?? "Not specified";
    const dietary = userProfile?.dietary ?? "Not specified";

    // --- Build system instruction ---
    const systemInstruction = `You are a knowledgeable and friendly AI travel agent. Help users plan their trips by searching for flights, hotels, activities, and providing personalized recommendations.

User Profile (from onboarding):
- Budget per person: ${budget}
- Destination vibe: ${destination}
- Trip style: ${trip_style}
- Morning pace: ${pace_morning}
- Evening pace: ${pace_evening}
- Downtime preference: ${downtime}
- Accommodation preference: ${accommodation}
- Dietary restrictions: ${Array.isArray(dietary) ? dietary.join(", ") : dietary}

You have access to a real traveler reviews database currently loaded with reviews for Maui. Whenever a user asks about places, restaurants, hotels, beaches, or activities — especially in Maui — always call search_reviews to ground your recommendations in real traveler experiences. Use create_itinerary to build a structured day-by-day plan when the user is ready to finalize their trip.`;

    // --- Map history to Gemini contents ---
    const historyList = messageHistory ?? [];
    const contents: GeminiContent[] = await Promise.all(
      historyList.map(async (msg: { role: string; content: string; attachments?: Array<{ name: string; url: string; mime_type: string }> }, index: number) => {
        const isLastUserMsg = index === historyList.length - 1 && msg.role === "user";
        const textPart: GeminiPart = { text: msg.content };

        if (!isLastUserMsg || attachments.length === 0) {
          return {
            role: msg.role === "user" ? "user" : "model",
            parts: [textPart],
          } as GeminiContent;
        }

        // Build multimodal parts for the current user message
        const parts: GeminiPart[] = [textPart];

        for (const att of attachments) {
          const supportedMimeTypes = [
            "image/jpeg", "image/png", "image/gif", "image/webp",
            "application/pdf",
          ];

          if (!supportedMimeTypes.includes(att.mime_type)) {
            // For unsupported types, just append a text description
            parts.push({ text: `[Attached file: ${att.name} (${att.mime_type}) — ${att.url}]` });
            continue;
          }

          try {
            const fileResp = await fetch(att.url);
            if (!fileResp.ok) throw new Error(`Failed to fetch attachment: ${att.url}`);
            const buffer = await fileResp.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            parts.push({
              inlineData: {
                mimeType: att.mime_type,
                data: base64,
              },
            });
          } catch (fetchErr) {
            console.error(`Could not fetch attachment ${att.name}:`, fetchErr);
            parts.push({ text: `[Attached file: ${att.name} — could not be loaded]` });
          }
        }

        return {
          role: "user",
          parts,
        } as GeminiContent;
      })
    );

    // --- Agentic loop (max 5 iterations) ---
    const MAX_ITERATIONS = 5;
    let finalAssistantText = "";

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const geminiResponse = await callGemini(systemInstruction, contents, GEMINI_API_KEY);

      const candidate = geminiResponse.candidates?.[0];
      if (!candidate) {
        throw new Error("No candidate in Gemini response");
      }

      const parts: GeminiPart[] = candidate.content.parts ?? [];

      // Check for function calls
      const functionCallParts = parts.filter((p) => p.functionCall);

      if (functionCallParts.length === 0) {
        // No more tool calls — collect text and break
        finalAssistantText = parts
          .filter((p) => p.text)
          .map((p) => p.text)
          .join("");
        break;
      }

      // Append model turn (the function call turn)
      contents.push({
        role: "model",
        parts,
      });

      // Execute each tool call and build the function response parts
      const functionResponseParts: GeminiPart[] = [];

      for (const part of functionCallParts) {
        const { name, args } = part.functionCall!;
        let toolResult: unknown;

        try {
          switch (name) {
            case "create_itinerary":
              toolResult = createItinerary(args as Parameters<typeof createItinerary>[0]);
              break;
            case "search_reviews":
              toolResult = await searchReviews(
                args as { query: string; city: string; count?: number },
                OPENAI_API_KEY,
                SUPABASE_URL,
                SUPABASE_SERVICE_ROLE_KEY
              );
              break;
            default:
              toolResult = { error: `Unknown tool: ${name}` };
          }
        } catch (toolError) {
          console.error(`Tool ${name} error:`, toolError);
          toolResult = {
            error: toolError instanceof Error ? toolError.message : "Tool execution failed",
          };
        }

        functionResponseParts.push({
          functionResponse: { name, response: toolResult },
        });
      }

      // Append function response turn as "user" role per Gemini spec
      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    // --- Save assistant message ---
    if (finalAssistantText) {
      const { error: insertAssistantError } = await serviceClient
        .from("messages")
        .insert({
          conversation_id,
          role: "assistant",
          content: finalAssistantText,
          is_agent: true,
        });
      if (insertAssistantError) {
        console.error("Failed to save assistant message:", insertAssistantError);
      }
    }

    return corsResponse(JSON.stringify({ ok: true }), 200);
  } catch (err) {
    console.error("Agent error:", err);
    return corsResponse(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      500
    );
  }
});
