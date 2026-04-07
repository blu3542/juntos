# Handoff: Login Latency Bug

## Current Symptom
After a successful login, the app shows "Logged in! Loading your account..." in the AuthForm but then takes a very long time (many seconds) before transitioning to the chat screen.

## What We Know
- Login itself succeeds — `supabase.auth.signInWithPassword` returns no error
- The DB has correct content (messages, agent responses all working)
- The LLM and edge function are working correctly (~2.8s response time, acceptable)
- The delay happens AFTER login, during the `resolveSession` function in `App.jsx`

## Where The Delay Is
`resolveSession` in `client/src/App.jsx` runs after every auth state change. After login it:
1. Sets the session
2. Queries `user_profiles` to check if the user needs onboarding
3. Sets `appState` to `'chat'` or `'onboarding'`

The suspected bottleneck is step 2 — the `user_profiles` Supabase query. We added timing logs to confirm:

```js
console.log('[resolveSession] session found, checking profile...')
const t0 = performance.now()
// ... query ...
console.log(`[resolveSession] profile query done in ${(performance.now() - t0).toFixed(0)}ms`)
```

**The console timing output has not yet been captured** — this is the immediate next step.

## Fixes Already Applied This Session
| Fix | File | Status |
|-----|------|--------|
| `resolving.current` never reset on null session → blocked all future logins | `App.jsx` | ✅ Fixed |
| `fetchMessages` had no try/catch → loading spinner stuck forever | `ChatWindow.jsx` | ✅ Fixed |
| `messages` table not in Supabase realtime publication → agent responses never arrived | DB migration | ✅ Fixed |
| `.single()` on user_profiles check → 406 error for new users | `App.jsx` | ✅ Fixed |
| `resolveSession` called twice (getSession + onAuthStateChange race) | `App.jsx` | ✅ Fixed |
| Gemini thinking mode enabled by default → slow agent responses | Edge Function | ✅ Fixed |
| Wrong Gemini model (quota exhausted on 2.0-flash) | Edge Function | ✅ Fixed (now gemini-2.5-flash) |

## Immediate Next Step
1. Log in to the app
2. Open browser DevTools → Console
3. Look for `[resolveSession] profile query done in Xms`
4. If X is large (>1000ms) → the bottleneck is the Supabase `user_profiles` query (likely DB cold start on free tier)
5. If X is small (<200ms) → the bottleneck is elsewhere (check Network tab for hanging requests)

## Likely Fix
If the `user_profiles` query is confirmed slow, the solution is to remove it from the critical login path entirely. Instead of blocking the transition on a DB query, use Supabase Auth user metadata to store whether onboarding is complete:

**On onboarding finish** (`Onboarding.jsx`):
```js
await supabase.auth.updateUser({
  data: { onboarding_complete: true }
})
```

**In `resolveSession`** (`App.jsx`) — read from session metadata instead of DB:
```js
const onboardingComplete = newSession.user.user_metadata?.onboarding_complete
setAppState(onboardingComplete ? 'chat' : 'onboarding')
// No DB query needed — session already has this info
```

This makes the login transition instant since `newSession` is already in memory.

## Key Files
| File | Role |
|------|------|
| `client/src/App.jsx` | Auth state machine, `resolveSession` logic |
| `client/src/components/AuthForm.jsx` | Login/signup UI |
| `client/src/components/ChatWindow.jsx` | Message loading + Realtime subscription |
| `client/src/components/ConversationList.jsx` | Sidebar, conversation creation |
| `supabase/functions/agent/index.ts` | Agentic loop (Gemini 2.5 Flash, deployed) |

## Project Context
See `CLAUDE.md` for full architecture, tech stack, and build status.
