# API Reference

All endpoints under `/api/v1` (Fastify) and `/api` (Next.js proxy).

## Room Lifecycle

### `POST /api/v1/rooms`
Create a new room.

**Request:**
```json
{ "displayName": "小明" }
```

**Response (201):**
```json
{
  "code": "ABC234",
  "token": "eyJhbG...",
  "identity": "host-mtmxyz-abcd",
  "livekitUrl": "wss://192.168.10.44:7880"
}
```

The `token` is a LiveKit JWT scoped to `code` as the room. Use it to connect via `livekit-client`.

---

### `POST /api/v1/rooms/:code/join`
Join an existing room.

**Request:**
```json
{ "displayName": "小華" }
```

**Response (200):**
```json
{
  "code": "ABC234",
  "token": "eyJhbG...",
  "identity": "user-mtmxyz-abcd",
  "livekitUrl": "wss://192.168.10.44:7880",
  "participants": [
    { "identity": "host-mtmxyz-...", "displayName": "小明", "joinedAt": 1788522533803 }
  ]
}
```

**Errors:**
- `400 invalid_request` — code format invalid
- `404 room_not_found` — code doesn't match active room
- `409 room_full` — 10 participants already

---

### `GET /api/v1/rooms`
List active rooms (used by AI bot to discover which to join).

**Response (200):**
```json
{
  "rooms": [
    { "code": "ABC234", "createdAt": 1788522533803, "participantCount": 2 }
  ]
}
```

---

### `GET /api/v1/rooms/:code`
Room metadata.

**Response (200):**
```json
{
  "code": "ABC234",
  "createdAt": 1788522533803,
  "createdBy": "host-mtmxyz-...",
  "participantCount": 2,
  "isActive": true,
  "participants": [...]
}
```

---

### `DELETE /api/v1/rooms/:code`
End the room (no auto-end on empty currently).

**Response:** `204 No Content`

---

### `GET /api/v1/config`
Public-facing config (browser reads to know which LiveKit URL to use).

**Response (200):**
```json
{ "livekitUrl": "wss://192.168.10.44:7880" }
```

## Recording Endpoints (used by AI bot)

### `POST /api/v1/rooms/:code/participants`
Record a participant join/update.

**Request:**
```json
{
  "identity": "user-mtmxyz-...",
  "displayName": "小華",
  "joinedAt": 1788522533803
}
```

**Response:** `204 No Content`

---

### `POST /api/v1/rooms/:code/utterances`
Append a transcribed utterance.

**Request:**
```json
{
  "id": "u_1788522_xyz",
  "ts": 1788522533803,
  "speakerId": "user-mtmxyz-...",
  "speakerName": "小華",
  "text": "我覺得這個方案不錯",
  "confidence": 0.95,
  "durationMs": 4200
}
```

**Response:** `204 No Content`

---

### `POST /api/v1/rooms/:code/interventions`
Append an AI intervention log.

**Request:**
```json
{
  "id": "int_1788522_abc",
  "ts": 1788522534800,
  "personaId": "critic",
  "scenarioId": "general",
  "kind": "contradiction",
  "text": "你剛剛說不錯，但又說會失敗，矛盾在哪？",
  "confidence": 0.82,
  "triggeredByUtteranceId": "u_1788522_xyz",
  "latencyMs": { "stt": 380, "llm": 850, "tts": 320, "total": 1550 }
}
```

**Response:** `204 No Content`

---

### `GET /api/v1/recordings/:code`
Get the full recording JSON.

**Response (200):**
```json
{
  "code": "ABC234",
  "createdAt": 1788522533803,
  "endedAt": 1788522560000,
  "participants": [...],
  "utterances": [...],
  "interventions": [...]
}
```

**Errors:** `404 recording_not_found`

---

### `DELETE /api/v1/recordings/:code`
Finalize and clear cached recording (called when room is closed).

**Response:** `204 No Content`

## Next.js Proxy Routes (for browser)

| Next.js | Forwards to |
|---|---|
| `POST /api/rooms` | `POST http://api:3001/api/v1/rooms` |
| `POST /api/rooms/:code/join` | `POST http://api:3001/api/v1/rooms/:code/join` |
| `GET /api/config` | `GET http://api:3001/api/v1/config` |
| `GET /api/recordings/:code` | `GET http://api:3001/api/v1/recordings/:code` |

CORS-allowed origins: see `CORS_ORIGINS` env (comma-separated).

## Rate Limits

- `POST /api/v1/rooms` — 100 req/min/IP (default `@fastify/rate-limit` config)
- `POST /api/v1/rooms/:code/join` — same
- Recording endpoints (bot writes) — no rate limit
