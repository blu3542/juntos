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
    name: "search_flights",
    description: "Search for available flights between two cities",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Origin city or airport code" },
        destination: {
          type: "string",
          description: "Destination city or airport code",
        },
        date: {
          type: "string",
          description: "Departure date in YYYY-MM-DD format",
        },
        return_date: {
          type: "string",
          description: "Return date for round trips (optional)",
        },
      },
      required: ["origin", "destination", "date"],
    },
  },
  {
    name: "search_hotels",
    description: "Search for available hotels in a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
        check_in: {
          type: "string",
          description: "Check-in date YYYY-MM-DD",
        },
        check_out: {
          type: "string",
          description: "Check-out date YYYY-MM-DD",
        },
        guests: { type: "number", description: "Number of guests" },
      },
      required: ["location", "check_in", "check_out"],
    },
  },
  {
    name: "get_weather_forecast",
    description: "Get weather forecast for a destination",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
        date: { type: "string", description: "Date in YYYY-MM-DD format" },
      },
      required: ["location", "date"],
    },
  },
  {
    name: "search_activities",
    description:
      "Search for activities, attractions, and restaurants at a destination",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
        type: {
          type: "string",
          description:
            "Type of activity: sightseeing, food, adventure, relaxation, nightlife",
        },
      },
      required: ["location"],
    },
  },
  {
    name: "estimate_budget",
    description: "Estimate total trip cost given components",
    parameters: {
      type: "object",
      properties: {
        flight_cost: { type: "number" },
        hotel_cost_per_night: { type: "number" },
        nights: { type: "number" },
        activity_budget: { type: "number" },
        num_travelers: { type: "number" },
      },
      required: [
        "flight_cost",
        "hotel_cost_per_night",
        "nights",
        "num_travelers",
      ],
    },
  },
  {
    name: "save_trip_item",
    description: "Save a flight, hotel, or activity to the user's trip",
    parameters: {
      type: "object",
      properties: {
        trip_id: { type: "string", description: "UUID of the trip to save to" },
        type: { type: "string", enum: ["flight", "hotel", "activity"] },
        data: { type: "object", description: "Item details" },
      },
      required: ["trip_id", "type", "data"],
    },
  },
  {
    name: "get_user_profile",
    description: "Retrieve the user's travel preferences",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
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
function searchFlights(args: {
  origin: string;
  destination: string;
  date: string;
  return_date?: string;
}) {
  const { origin, destination, date, return_date } = args;
  return [
    {
      airline: "Delta Airlines",
      flight_number: "DL 4821",
      origin,
      destination,
      departure: `${date}T08:15:00`,
      arrival: `${date}T11:45:00`,
      duration: "3h 30m",
      price: 312,
      class: "Economy",
      return_date: return_date ?? null,
    },
    {
      airline: "United Airlines",
      flight_number: "UA 2034",
      origin,
      destination,
      departure: `${date}T13:00:00`,
      arrival: `${date}T16:55:00`,
      duration: "3h 55m",
      price: 278,
      class: "Economy",
      return_date: return_date ?? null,
    },
    {
      airline: "American Airlines",
      flight_number: "AA 987",
      origin,
      destination,
      departure: `${date}T18:30:00`,
      arrival: `${date}T22:10:00`,
      duration: "3h 40m",
      price: 345,
      class: "Economy",
      return_date: return_date ?? null,
    },
  ];
}

function searchHotels(args: {
  location: string;
  check_in: string;
  check_out: string;
  guests?: number;
}) {
  const { location, check_in, check_out, guests = 2 } = args;
  return [
    {
      name: `The Grand ${location} Hotel`,
      stars: 5,
      location,
      check_in,
      check_out,
      guests,
      price_per_night: 289,
      amenities: ["Pool", "Spa", "Free WiFi", "Breakfast included", "Gym"],
      rating: 4.8,
    },
    {
      name: `${location} Comfort Inn`,
      stars: 3,
      location,
      check_in,
      check_out,
      guests,
      price_per_night: 119,
      amenities: ["Free WiFi", "Parking", "Pet friendly"],
      rating: 4.2,
    },
    {
      name: `Boutique Stay ${location}`,
      stars: 4,
      location,
      check_in,
      check_out,
      guests,
      price_per_night: 195,
      amenities: [
        "Rooftop bar",
        "Free WiFi",
        "City views",
        "Concierge service",
      ],
      rating: 4.6,
    },
  ];
}

function getWeatherForecast(args: { location: string; date: string }) {
  const { location, date } = args;
  // Deterministically vary mock data based on month
  const month = new Date(date).getMonth();
  const isSummer = month >= 5 && month <= 8;
  return {
    location,
    date,
    condition: isSummer ? "Sunny with light breeze" : "Partly cloudy",
    temp_high_f: isSummer ? 84 : 62,
    temp_low_f: isSummer ? 68 : 48,
    humidity: isSummer ? 45 : 60,
    precipitation_chance: isSummer ? "5%" : "30%",
    recommendation: isSummer
      ? "Great day for outdoor activities. Bring sunscreen!"
      : "Light jacket recommended. Good day for indoor sightseeing.",
  };
}

function searchActivities(args: { location: string; type?: string }) {
  const { location, type = "sightseeing" } = args;
  const activities = [
    {
      name: `${location} City Walking Tour`,
      type: "sightseeing",
      description: `Explore the historic streets and landmarks of ${location} with an expert local guide.`,
      duration: "3 hours",
      price: 35,
      rating: 4.7,
    },
    {
      name: `${location} Food & Wine Experience`,
      type: "food",
      description: `Sample local cuisine and wines at curated restaurants and markets in ${location}.`,
      duration: "4 hours",
      price: 95,
      rating: 4.9,
    },
    {
      name: `${location} Adventure Hike`,
      type: "adventure",
      description: `Scenic hiking trail offering breathtaking views of the ${location} landscape.`,
      duration: "5 hours",
      price: 55,
      rating: 4.5,
    },
    {
      name: `${location} Spa & Wellness Day`,
      type: "relaxation",
      description: `Full-day relaxation package at ${location}'s top-rated spa resort.`,
      duration: "Full day",
      price: 180,
      rating: 4.8,
    },
    {
      name: `${location} Night Life Tour`,
      type: "nightlife",
      description: `Experience the vibrant nightlife scene with access to top clubs and rooftop bars in ${location}.`,
      duration: "5 hours",
      price: 75,
      rating: 4.4,
    },
  ];
  // Filter by type if provided; fall back to all
  const filtered = activities.filter((a) => !type || a.type === type);
  return filtered.length > 0 ? filtered : activities;
}

function estimateBudget(args: {
  flight_cost: number;
  hotel_cost_per_night: number;
  nights: number;
  activity_budget?: number;
  num_travelers: number;
}) {
  const {
    flight_cost,
    hotel_cost_per_night,
    nights,
    activity_budget = 0,
    num_travelers,
  } = args;
  const flight_total = flight_cost * num_travelers;
  const hotel_total = hotel_cost_per_night * nights;
  const activities_total = activity_budget;
  const subtotal = flight_total + hotel_total + activities_total;
  const taxes_fees = Math.round(subtotal * 0.12);
  const grand_total = subtotal + taxes_fees;
  return {
    breakdown: {
      flights: `$${flight_total} (${num_travelers} traveler${num_travelers > 1 ? "s" : ""} × $${flight_cost})`,
      hotel: `$${hotel_total} (${nights} night${nights > 1 ? "s" : ""} × $${hotel_cost_per_night}/night)`,
      activities: `$${activities_total}`,
      taxes_and_fees: `$${taxes_fees} (estimated 12%)`,
    },
    subtotal: subtotal,
    taxes_and_fees: taxes_fees,
    grand_total: grand_total,
    per_person: Math.round(grand_total / num_travelers),
    currency: "USD",
  };
}

async function saveTripItem(
  args: { trip_id: string; type: string; data: Record<string, unknown> },
  serviceClient: ReturnType<typeof createClient>
) {
  const { trip_id, type, data } = args;
  const { data: row, error } = await serviceClient
    .from("trip_items")
    .insert({ trip_id, type, data })
    .select("id")
    .single();
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, id: row?.id };
}

async function getUserProfile(
  userId: string,
  serviceClient: ReturnType<typeof createClient>
) {
  const { data, error } = await serviceClient
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) {
    return { ok: false, error: error.message };
  }
  return data;
}

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
  const relevant = reviews.filter((r) => r.similarity >= 0.7);

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
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!GEMINI_API_KEY) {
      return corsResponse(JSON.stringify({ error: "GEMINI_API_KEY not set" }), 500);
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return corsResponse(JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }), 500);
    }
    if (!SUPABASE_ANON_KEY) {
      return corsResponse(JSON.stringify({ error: "SUPABASE_ANON_KEY not set" }), 500);
    }

    // --- Supabase clients ---
    // Anon client for JWT verification
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    // Service role client for DB writes (bypasses RLS)
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Authenticate user ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return corsResponse(JSON.stringify({ error: "Missing Authorization header" }), 401);
    }
    const jwt = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !user) {
      return corsResponse(JSON.stringify({ error: "Invalid or expired token" }), 401);
    }
    const userId = user.id;

    // --- Parse body ---
    let body: { conversation_id: string; user_message: string };
    try {
      body = await req.json();
    } catch {
      return corsResponse(JSON.stringify({ error: "Invalid JSON body" }), 400);
    }
    const { conversation_id, user_message } = body;
    if (!conversation_id || !user_message) {
      return corsResponse(
        JSON.stringify({ error: "conversation_id and user_message are required" }),
        400
      );
    }

    // --- Save user message ---
    const { error: insertUserMsgError } = await serviceClient
      .from("messages")
      .insert({
        conversation_id,
        role: "user",
        content: user_message,
        is_agent: false,
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

Always use your tools to provide specific, grounded recommendations rather than generic advice. When you have enough information, proactively suggest relevant options.`;

    // --- Map history to Gemini contents ---
    const contents: GeminiContent[] = (messageHistory ?? []).map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

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
            case "search_flights":
              toolResult = searchFlights(args as Parameters<typeof searchFlights>[0]);
              break;
            case "search_hotels":
              toolResult = searchHotels(args as Parameters<typeof searchHotels>[0]);
              break;
            case "get_weather_forecast":
              toolResult = getWeatherForecast(args as Parameters<typeof getWeatherForecast>[0]);
              break;
            case "search_activities":
              toolResult = searchActivities(args as Parameters<typeof searchActivities>[0]);
              break;
            case "estimate_budget":
              toolResult = estimateBudget(args as Parameters<typeof estimateBudget>[0]);
              break;
            case "save_trip_item":
              toolResult = await saveTripItem(
                args as Parameters<typeof saveTripItem>[0],
                serviceClient
              );
              break;
            case "get_user_profile":
              toolResult = await getUserProfile(userId, serviceClient);
              break;
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
