# Architecture

## Overview

futuremode2026 is a Google Meet-style video conferencing web app with a built-in **real-time AI assistant** that listens via STT, analyzes speech via LLM, and interjects via TTS when it detects unreasonable requests, contradictions, stagnation, or off-topic drift.

## System Diagram

```
                       ┌─ Browser A ─┐
                       ├ Browser B ──┤
                       └ Browser N ──┘  (WebRTC via LiveKit SFU)
                              │
                              ▼
                     ┌───── LiveKit SFU ─────┐
                     │                       │
                     │   ┌─ ai-bot worker ─┐ │
                     │   │ subscribe audio│ │ ← @livekit/rtc-node
                     │   │ publish AI voice│ │
                     │   │                 │ │
                     │   │ VAD → buffer    │ │
                     │   │   └ silence 700ms┴─→ STT (custom endpoint)
                     │   │                       │
                     │   │                       ├─→ Utterance event
                     │   │                       │   ├─ recorder (JSON)
                     │   │                       │   └─ DataChannel → browsers
                     │   │                       │
                     │   │ context buffer ──────┴─→ LLM (custom endpoint)
                     │   │                          │
                     │   │   intervene=true ────────→ TTS (custom endpoint)
                     │   │                          │
                     │   │   push PCM frames ────────┘
                     │   └────────────────────┘
                     └───────────────────────┘
                              ▲
                              │  REST poll every 5s
                              │
                       ┌──── Fastify API ────┐
                       │ roomStore (memory)  │
                       │ recordings (JSON)   │ ← /api/v1/rooms/:code/{participants,utterances,interventions}
                       └─────────────────────┘
```

## Process Topology

| Process | Tech | Port | Purpose |
|---|---|---|---|
| `livekit-server` | Go binary | 7881 (TCP+WS), 7882 (TCP), 7883 (UDP) | WebRTC SFU + signaling |
| `livekit-tls-proxy` | Node.js | 7880 (TLS termination) | wss:// for browsers (since LiveKit 1.11 OSS lacks signaling TLS) |
| `apps/api` | Fastify + TS | 3001 (HTTP) | Room mgmt, JWT minting, recording persistence |
| `apps/web` | Next.js 14 + TS | 3000 (HTTPS in dev) | UI: landing, meeting room, recap |
| `services/ai-bot` | Node.js + TS | (none, joins rooms as participant) | Server-side AI bot |

## AI Orchestrator State Machine

```
IDLE → (utterance received) → ANALYZING (LLM call)
ANALYZING → (decision) → DECIDING
DECIDING → (intervene=false) → IDLE
DECIDING → (intervene=true AND cooldown elapsed) → SPEAKING (TTS → AudioSource)
SPEAKING → (stream ends) → COOLDOWN (10s by default)
COOLDOWN → (timer expires) → IDLE
```

Decision gate (`orchestrator/decision.ts`):
```ts
function shouldIntervene(d, lastAt, now, persona) {
  if (!d.intervene) return false;
  if (now - lastAt < persona.cooldownMs) return false;
  if (d.confidence < persona.threshold) return false;
  if (d.kind === 'stagnation' && d.confidence < persona.threshold + 0.1) return false;
  return true;
}
```

## Speaker Diarization

We rely on **per-participant audio tracks** from LiveKit. Each browser publishes its mic as a separate track. The AI bot subscribes to each track independently via `room.remoteParticipants[id].trackPublications`. Whisper transcribes the single-speaker audio and we tag the result with `participant.identity`. No pyannote / overlap detection needed for MVP.

## Context Buffer

Rolling window (`orchestrator/contextBuffer.ts`):
- Last 10 utterances per speaker
- Last 5 minutes per speaker (whichever shorter)
- Global cap: last 50 utterances across the room

## LLM System Prompt Structure

```
<SYSTEM>
你是 {persona.displayName}。{persona.description}
{currentScenario.systemPromptAddition}

決策規則：
- 偵測到邏輯矛盾、離題、停滯不前、過度承諾、不合理要求 → 指出問題並提出具體建議。
- 不要重複別人已說的觀點。
- 不要為了發言而發言：寧可不說。

對話上下文（最近 5 分鐘）：
{rollingWindowAsDialogue}

當前發言者：{speaker.displayName}
發言內容："{latestUtterance.text}"

請以 JSON 回答：
{ "intervene": true|false,
  "confidence": 0.0–1.0,
  "kind": "contradiction"|"off_topic"|"stagnation"|"unreasonable"|"none",
  "spoken_response": "繁體中文，1–2 句，口語",
  "reason": "內部一行註記" }
</SYSTEM>
```

JSON mode is enforced via `response_format: { type: 'json_object' }`.

## Recording Storage

Per-room JSON file: `apps/api/data/recordings/<roomCode>.json`. Debounced writes (1s after last append) prevent data loss on bot crash.

Schema:
```ts
interface Recording {
  code: string;
  createdAt: number;
  endedAt?: number;
  participants: Participant[];
  utterances: Utterance[];      // every STT result
  interventions: InterventionLog[];  // every AI speak
}
```

## Configuration

All env-driven. Three endpoint groups:

| Env | Default | Purpose |
|---|---|---|
| `OPENAI_API_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_TTS_*` | none (uses api.openai.com) | LLM + TTS — can point at any OpenAI-compatible endpoint |
| `STT_API_URL`, `STT_API_KEY`, `STT_MODEL` | none (uses api.openai.com) | Whisper STT — separate from LLM for cost/quota isolation |
| `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | localhost:7881, wss://<lan>:7880 | LiveKit SFU — bot uses internal, browser uses public TLS |

## Why these choices?

- **LiveKit OSS over mediasoup**: server-side audio subscription via `@livekit/rtc-node` (Node.js + native FFI). mediasoup would require building a server-side audio pipeline from scratch (~weeks).
- **OpenAI-compatible endpoints everywhere**: pick any provider for LLM/TTS/STT. No vendor lock-in.
- **Bot in Node.js**: matches the rest of the stack, easy to deploy.
- **Per-participant tracks for diarization**: zero ML cost, deterministic attribution.
- **JSON-mode LLM**: structured output without function-calling overhead.
- **In-memory roomStore**: simple, MVP-acceptable. Multi-instance requires Redis (Phase 6).
