# CLAUDE.md — Travel Agent Chat Interface

This document captures the project context, architecture decisions, and implementation intent for Claude Code working in this codebase.

---

## Project Overview

A **real-time travel planning chat interface** powered by an agentic LLM loop. Users interact with an AI travel agent that can call custom tools (flight search, weather, activities, etc.) to provide grounded, personalized travel insights.

This is a CS 560 final project. The codebase started as a group chat app from Lab 10 and is being evolved into a full travel agent product.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (migrating from Vanilla JS) |
| Backend | Supabase (Auth, Postgres, Realtime, Edge Functions) |
| LLM | Gemini 2.0 Flash via Google Generative Language API |
| Agent host | Supabase Edge Function (Deno/TypeScript) |
| Real-time | Supabase Realtime (DB broadcast on `messages` table) |
| Travel APIs | TBD — mock/stubbed data for now |

---

## Architecture

```
Frontend (React)
  └── Supabase JS client
        ├── Auth (sign up / log in)
        ├── Realtime subscription on `messages`
        └── REST calls to Edge Functions

Supabase
  ├── Auth         — user identity
  ├── Postgres DB  — all persistent state
  ├── Realtime     — pushes new messages to frontend
  └── Edge Functions
        └── /functions/agent  — agentic loop (core business logic)

Edge Function: Agentic Loop
  └── Calls Gemini 2.0 Flash API with function declarations
        └── On functionCall in response parts → execute tool → loop
        └── On no functionCall → save message → Realtime broadcasts to frontend
```

---

## Database Schema

```sql
-- auth.users is managed by Supabase Auth

user_profiles    -- 1:1 with auth.users, stores onboarding answers + travel preferences
conversations    -- one per chat session, belongs to a user
messages         -- chat history rows (role: user | assistant | tool_result)
tool_calls       -- log of every tool invocation: name, inputs, output, timestamp
trips            -- saved trip plans per user
trip_items       -- individual flights, hotels, activities within a trip
```

---

## The Agentic Loop

Lives in a Supabase Edge Function (`/functions/agent`). Triggered when a user sends a message.

```
1. Save user message to `messages` table
2. Load full conversation history for this conversation
3. Load user profile from `user_profiles`
4. Build system prompt (travel agent persona + injected user profile)
5. POST to Gemini 2.0 Flash generateContent with history + functionDeclarations
6. If response parts contain functionCall:
     - Execute each tool function
     - Append model turn + functionResponse user turn to contents
     - Loop back to step 5 (max 5 iterations)
7. If no functionCall in response:
     - Save assistant text to `messages` table (is_agent: true)
     - Supabase Realtime broadcasts the INSERT to all subscribed clients
8. Frontend receives Realtime event and appends message to chat UI
```

**Response mode: discrete** — the full assistant message is saved and broadcast at once, not streamed token-by-token.

---

## Tool Definitions

| Tool | Purpose | Data Source |
|------|---------|-------------|
| `search_flights` | Find flights by origin, destination, dates | Stubbed (real API TBD) |
| `search_hotels` | Find accommodations by location and dates | Stubbed (real API TBD) |
| `get_weather_forecast` | Get forecast for a destination | Stubbed (real API TBD) |
| `search_activities` | Find POIs, restaurants, tours | Stubbed (real API TBD) |
| `estimate_budget` | Compute cost breakdown for a trip | Internal logic |
| `save_trip_item` | Persist a flight/hotel/activity to `trip_items` | Supabase DB write |
| `get_user_profile` | Retrieve user travel preferences | Supabase DB read |
| `create_itinerary` | Generate a structured day-by-day plan | Pure LLM (no external API) |

Tools are implemented inside the Edge Function. Stubbed tools return realistic mock data until real APIs are integrated.

---

## User Profile & Onboarding

The **onboarding questionnaire** (already in the frontend) collects:
- Budget range
- Destination type preference (beach, city, nature, etc.)
- Group size
- Trip style (adventure, relaxation, culture, etc.)

These answers are saved to the `user_profiles` table on onboarding completion.

**Critical design rule**: The user profile is **always injected into the agent's system prompt** at the start of every conversation. This personalizes every response without requiring the user to re-state preferences.

Example system prompt injection:
```
You are a friendly, knowledgeable travel agent...

User profile:
- Budget: $2,000–$3,000
- Preferred destination type: Beach
- Group size: 2
- Trip style: Relaxation
```

---

## Key Architectural Decisions (Locked)

- **Discrete responses** — agent replies appear as complete messages, not streamed
- **Supabase as sole backend** — no separate server; all logic lives in Edge Functions and Postgres
- **User profile always in context** — injected into every system prompt, not retrieved on demand
- **Travel APIs stubbed for now** — real integrations (Amadeus, Skyscanner, etc.) deferred

---

## What Was Here Before (Legacy Code)

The repo previously contained a FastAPI + MySQL group chat app from Lab 10. This is being replaced entirely:

| Old | New |
|-----|-----|
| FastAPI (`app.py`) | Supabase Edge Functions |
| MySQL + asyncmy | Supabase Postgres |
| Custom JWT auth (`auth.py`) | Supabase Auth |
| WebSocket manager (`websocket_manager.py`) | Supabase Realtime |
| Vanilla JS frontend | React (Vite, `/client`) |
| OpenAI-compatible LLM client (`llm.py`) | Gemini 2.0 Flash via raw fetch |

Legacy files (`app.py`, `db.py`, `auth.py`, `llm.py`, `websocket_manager.py`, `sql/`) can be referenced for context but should not be extended.

---

## Build Status

- [x] Supabase DB schema (6 tables + RLS policies)
- [x] Supabase Edge Function: agentic loop (`/supabase/functions/agent/index.ts`) — deployed
- [x] React frontend (`/client`) — Vite + React, all components built
- [x] Tool implementations (8 tools, stubbed with mock data)
- [x] Gemini 2.0 Flash integration inside Edge Function (raw fetch)
- [x] Supabase Auth wired to frontend
- [x] Supabase Realtime subscription in React (ChatWindow)
- [x] Onboarding answers POSTed to `user_profiles` table

## Required Secrets (set in Supabase Dashboard → Settings → Edge Functions)

- `GEMINI_API_KEY` — Gemini API key (not committed to source)
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase runtime
- `SUPABASE_ANON_KEY` — auto-injected by Supabase runtime

## Running Locally

```bash
cd client
npm install
npm run dev
```
