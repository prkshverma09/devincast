# DevinCast

Live two-host **sports commentary** for an autonomous coding agent. A simulated coding
session on the left ("The Pitch"), an ESPN-style broadcast booth on the right
("The Broadcast") — commentary written by an LLM, voiced by ElevenLabs, and pushed to
the browser in real time by a Cloudflare Durable Object.

```
Next.js (static export)  ──WebSocket RPC──>  BroadcastAgent (Durable Object)
       │                                            │
   audio playback  <── broadcast {clip} ────────────┤── LLM (OpenRouter / OpenAI)
   retro visualizer                                 └── ElevenLabs TTS (mp3, base64)
```

One Worker serves both the static frontend (`assets` binding) and the agent, so
`npx wrangler dev` runs the whole app.

## Backend — `worker/`

- `BroadcastAgent extends Agent` (Cloudflare `agents` SDK, Durable Object + SQLite state).
- State: `eventHistory`, `transcript`, `nextSpeaker`, `lastEventAt`, `onAir`.
- `@callable() processEvent(eventText)` — records the event, generates a hyper-enthusiastic
  reaction with the *next* speaker's persona, synthesizes it with that speaker's ElevenLabs
  `voice_id`, broadcasts `{ type: "clip", clip }` to every connected client, and returns the
  clip (base64 mp3 + transcript) to the caller.
- `scheduleEvery(30, "checkDeadAir")` — if nothing has happened for 25s while on air, the
  agent generates "dead air banter" and pushes it to the frontend unprompted.
- Speaker personas and voice IDs live in `worker/personas.ts`.

## Frontend — `app/`

- Dark split-screen UI, Next.js App Router with `output: "export"`.
- **The Pitch**: a simulated cloud coding agent session (`app/session.ts`) — plan steps,
  shell commands with streamed stdout/stderr, diffs and git output. Every 10-15s the next
  step runs and its one-line summary goes to the agent via `agent.stub.processEvent(...)`.
- **The Broadcast**: `useAgent` from `agents/react`; incoming clips are queued and
  auto-played in order, with a WebAudio-driven retro bar visualizer.
- Browsers block autoplay until a gesture, so the show starts with the **GO LIVE** button.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in your keys
npm run dev                      # next build + wrangler dev on :8787
```

| Variable             | Required | Notes                                                       |
| -------------------- | -------- | ----------------------------------------------------------- |
| `ELEVENLABS_API_KEY` | yes      | Needs `text_to_speech` permission                            |
| `OPENROUTER_API_KEY` | one of   | Preferred when set                                           |
| `OPENAI_API_KEY`     | one of   | Fallback                                                     |
| `LLM_MODEL`          | no       | Defaults to `gpt-4o-mini` / `openai/gpt-4o-mini`             |
| `ELEVENLABS_MODEL_ID`| no       | Defaults to `eleven_flash_v2_5`                              |

On a free ElevenLabs plan, library voices return `402 paid_plan_required`; the defaults in
`worker/personas.ts` (Adam + George) work on the free tier.

## Scripts

```bash
node scripts/smoke.mjs                # push one event over RPC, write the mp3 to /tmp
node scripts/deadair.mjs              # idle a connection and wait for dead-air banter
npm run typecheck
npm run deploy                        # wrangler deploy (set secrets with `wrangler secret put`)
```
