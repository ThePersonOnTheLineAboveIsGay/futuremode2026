# AGENTS.md

> AI coding agent instructions for futuremode2026.
> Read this before making changes — it's the single source of project context.

## Project Summary

futuremode2026 is a Google Meet-style video conferencing web app with a **real-time AI assistant**. The AI listens to all participants via STT, analyzes conversation via LLM, and interjects via TTS when it detects unreasonable requests, contradictions, stagnation, or off-topic drift.

**MVP scope**: 10 participants per room, Traditional Chinese UI (i18n-ready routing), monorepo with separate frontend / API / AI bot services.

## Tech Stack (locked in)

- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind + `livekit-client@2.x`
- **API**: Fastify 5 + TypeScript + Zod + Pino
- **AI Bot**: Node.js + `@livekit/rtc-node` (server-side WebRTC) + `openai` SDK
- **WebRTC SFU**: LiveKit OSS server (Go binary, ≥ v1.10 for protocol 17 compat)
- **Monorepo**: pnpm workspaces
- **AI providers** (all OpenAI-compatible, swappable):
  - LLM + TTS: `OPENAI_API_URL` / `OPENAI_API_KEY`
  - STT (separate): `STT_API_URL` / `STT_API_KEY` / `STT_MODEL`

## Repository Layout

```
apps/
├── web/            # Next.js 14 frontend
│   ├── app/[lang]/ # i18n routing (zh-TW default, layout.tsx validates)
│   ├── components/meeting/         # VideoTile, ParticipantGrid, ControlBar, AIBanner, PersonaSelector
│   ├── components/transcript/      # TranscriptPanel
│   ├── hooks/useLiveKitRoom.ts     # Browser-side LiveKit room lifecycle
│   ├── hooks/useAIStream.ts        # Subscribe to AI events via LiveKit DataChannel
│   └── app/api/                    # Next.js proxy → Fastify API
├── api/            # Fastify backend
│   ├── src/routes/rooms.ts         # POST /rooms, POST /rooms/:code/join, GET /rooms
│   ├── src/routes/recordings.ts    # GET /recordings/:code, bot write endpoints
│   ├── src/services/roomStore.ts   # In-memory Map<RoomCode, Room>
│   ├── src/services/recordingStore.ts  # JSON file persistence (debounced)
│   └── src/services/livekitToken.ts    # Mint LiveKit JWTs
services/
└── ai-bot/         # Server-side AI bot worker
    ├── src/index.ts                # Polls API every 5s, spawns BotWorker per active room
    ├── src/worker/botWorker.ts     # LiveKit Room join, subscribe audio, publish TTS
    ├── src/worker/audioPipeline.ts # Per-speaker VAD → Whisper STT
    ├── src/worker/ttsPublisher.ts  # Push TTS PCM into LiveKit AudioSource
    ├── src/worker/recorder.ts      # POST utterances/interventions to API
    ├── src/orchestrator/
    │   ├── stateMachine.ts         # FSM (IDLE → ANALYZING → DECIDING → SPEAKING → COOLDOWN)
    │   ├── decision.ts             # Confidence threshold + cooldown gate
    │   └── contextBuffer.ts        # Rolling window per speaker (10 utterances, 5 min)
    └── src/ai/
        ├── openai.ts               # LLM/TTS shared client
        ├── stt.ts                  # Separate STT client (custom endpoint)
        ├── llm.ts                  # GPT with JSON mode
        ├── tts.ts                  # OpenAI TTS streaming → 24kHz PCM
        └── prompts/{critic,coach,consultant}.ts
packages/
└── shared/         # Cross-package types & constants
    ├── src/types/{room,transcript,persona,intervention}.ts
    └── src/constants.ts            # ROOM_CODE_LENGTH, MAX_PARTICIPANTS_MVP, DEFAULT_PERSONAS, etc.
infra/
├── livekit/        # SFU binary + config
├── coturn/         # TURN server config (for prod)
└── certs/          # Self-signed TLS certs + TLS proxy
docs/               # architecture.md, api.md, runbook.md
.github/workflows/  # ci.yml
```

## Coding Conventions

- **TypeScript strict mode**. No `any` except where bridging to 3rd-party libs (cast locally, don't pollute exported types).
- **ES modules** (`import`/`export`). All internal imports use `.js` extension (NodeNext convention) — TS resolves them at compile time.
- **Functional style preferred**. Classes only for stateful entities (Room, VAD, Buffer).
- **No barrel files** unless > 5 exports.
- **Comments**: explain *why*, not *what*. Keep code self-documenting.

## Critical Architectural Rules (DO NOT VIOLATE)

1. **Single source of truth for livekit URL** — frontend reads `/api/config`, not env. The API decides the URL based on `LIVEKIT_PUBLIC_URL`.
2. **Bot uses internal URL, browsers use public URL** — `LIVEKIT_URL` (bot, plain WS) ≠ `LIVEKIT_PUBLIC_URL` (browser, wss://).
3. **Use `127.0.0.1` not `localhost`** in bot-facing URLs — Windows resolves `localhost` to IPv6 first, but LiveKit server only listens on IPv4.
4. **LiveKit server must be ≥ 1.10** — 1.9.x only supports protocol 16, but `@livekit/rtc-node@0.13.x` needs 17+.
5. **STT uses separate endpoint from LLM/TTS** — different env vars, different `OpenAI` client instance. Don't merge.
6. **PCM audio pipeline**: 48kHz Int16 mono from LiveKit → wrap in WAV header → upload to STT. OpenAI Whisper doesn't accept raw PCM.
7. **TTS pushes 24kHz PCM frames** — not 48kHz. LiveKit AudioSource captures at the TTS rate.
8. **Speaker diarization via per-participant tracks** — never try to do ML-based diarization. Trust LiveKit's per-track separation.
9. **JSON-mode LLM** — `response_format: { type: 'json_object' }`. Don't parse unstructured text.
10. **Confidence threshold + cooldown gate** — never let AI speak without both checks passing. See `orchestrator/decision.ts`.

## Type System Patterns

```ts
// Discriminated union for events
export type InterventionEvent =
  | { type: 'utterance'; data: Utterance }
  | { type: 'intervention_start'; data: { text: string } }
  | { type: 'intervention_end'; data: InterventionLog }
  | { type: 'intervention_decision'; data: InterventionDecision };

// Branded types for IDs (avoid mixing strings)
type RoomCode = string; // 6-char base32
type Identity = string; // livekit identity
type UtteranceId = string;
```

## Common Tasks

### Add a new AI persona
1. Add to `packages/shared/src/constants.ts` → `DEFAULT_PERSONAS`
2. Create `services/ai-bot/src/ai/prompts/<name>.ts` exporting `prompt(scenario) => string`
3. Register in `services/ai-bot/src/ai/llm.ts` → `PERSONA_PROMPTS`
4. Add display name to `apps/web/messages/zh-TW.json`
5. Add option to `apps/web/components/meeting/PersonaSelector.tsx` (auto via `DEFAULT_PERSONAS`)

### Add a new API endpoint
1. Add route in `apps/api/src/routes/<name>.ts`
2. Register in `apps/api/src/server.ts` (with `/api/v1` prefix)
3. If browser needs to call it, add proxy in `apps/web/app/api/<path>/route.ts`
4. Update `docs/api.md`

### Add a new STT/TTS/LLM provider
- **STT**: edit `services/ai-bot/src/ai/stt.ts` to add a new client branch (or just point `STT_API_URL` at a different base URL if OpenAI-compatible)
- **LLM/TTS**: same — point `OPENAI_API_URL` if OpenAI-compatible
- **Non-OpenAI-compatible**: replace the `OpenAI` client with the provider's SDK and adapt the call signatures

### Debug bot not joining rooms
1. Check bot log for `[ai-bot] failed to fetch rooms` → API unreachable (check port 3001)
2. Check bot log for `failed to spawn worker for <code>` → LiveKit connection issue
3. Verify `LIVEKIT_URL` uses `127.0.0.1`, not `localhost`
4. Verify LiveKit server version ≥ 1.10 (`livekit-server --version`)

## Testing

- Unit tests in `tests/` using vitest
- Run with: `pnpm test`
- Add tests for: code generator, decision gate, context buffer, persona prompts (mock LLM)
- For bot integration tests: mock `@livekit/rtc-node`, mock OpenAI client

## Environment Loading

- **Backend (api)**: `tsx --env-file=../../.env` (loads project root `.env`)
- **Bot**: same pattern, `--env-file=../../.env`
- **Web (Next.js)**: loads `apps/web/.env.local` (NOT project root `.env`!). To run with custom API URL, edit `.env.local` or set `NEXT_PUBLIC_*` env vars at process start.
- **LiveKit binary**: reads `infra/livekit/livekit.yaml` only (no env)

## Don't

- Don't add Dockerfiles unless asked (project intentionally runs directly without Docker)
- Don't add a database (Phase 6 scope). JSON files are intentional.
- Don't add authentication (out of MVP scope; room codes are sufficient)
- Don't try to fix IPv6 by binding LiveKit to `[::]` — bots use IPv4 explicitly
- Don't merge LLM and STT clients — they have different endpoints by design

## Git Conventions

- Branch from `main`
- Commit messages: imperative mood, present tense ("Add X", not "Added X")
- One logical change per commit
- Don't commit: `.env` (only `.env.example`), `infra/certs/*.{crt,key}`, `infra/livekit/bin/*`, `node_modules`, build outputs

## Questions / Context to Preserve

- The project owner has working `OPENAI_API_URL` (gmi-serving) and `STT_API_URL` (openrouter). These may need to be re-asked on each session.
- Phase 0/1/2/3/4 done; Phase 5 (polish) and Phase 6 (scale) pending.
- MVP validated end-to-end with 2 browsers on LAN.
