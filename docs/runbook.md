# Runbook

Operational guide for running, debugging, and deploying futuremode2026.

## Local Dev (without Docker)

### Prerequisites
- Node.js 20+
- pnpm 9+
- LiveKit server binary (download from https://github.com/livekit/livekit/releases)
- `infra/certs/` self-signed TLS cert + key (generated via PowerShell)

### One-time setup
```bash
pnpm install
pnpm --filter @futuremode/shared build
cp .env.example .env
# Edit .env:
#   - LIVEKIT_API_KEY / LIVEKIT_API_SECRET (must match infra/livekit/livekit.yaml)
#   - OPENAI_API_URL + OPENAI_API_KEY (or LLM endpoint)
#   - STT_API_URL + STT_API_KEY + STT_MODEL (separate from LLM)
```

### Start all services (4 terminals or background)

```bash
# 1. LiveKit SFU
./infra/livekit/bin/livekit-server.exe --config infra/livekit/livekit.yaml

# 2. TLS proxy (only needed if browser uses wss:// via LAN IP)
node infra/certs/livekit-tls-proxy.mjs

# 3. API
cd apps/api && pnpm dev

# 4. Web
cd apps/web && pnpm dev
# Next.js starts on https://localhost:3000 (with self-signed cert)

# 5. AI Bot (optional, for AI features)
cd services/ai-bot && pnpm dev
```

Visit `https://localhost:3000` (or LAN IP `https://<lan-ip>:3000`).

## Environment Variables

| Var | Required | Default | Notes |
|---|---|---|---|
| `OPENAI_API_URL` | no | (api.openai.com) | Custom OpenAI-compatible endpoint for LLM + TTS |
| `OPENAI_API_KEY` | yes (bot) | — | |
| `OPENAI_MODEL` | no | `gpt-4o-mini` | |
| `OPENAI_TTS_MODEL` | no | `tts-1` | |
| `OPENAI_TTS_VOICE` | no | `onyx` | `alloy`/`echo`/`fable`/`nova`/`shimmer`/`onyx` |
| `STT_API_URL` | no | (api.openai.com) | Separate STT endpoint |
| `STT_API_KEY` | yes (bot) | — | |
| `STT_MODEL` | no | `whisper-1` | e.g. `openai/whisper-large-v3` for OpenRouter |
| `LIVEKIT_API_KEY` | yes | — | Must match `keys:` in `livekit.yaml` |
| `LIVEKIT_API_SECRET` | yes | — | ≥ 32 chars |
| `LIVEKIT_URL` | no | `ws://127.0.0.1:7881` | Bot uses this (plain WS, IPv4 explicit) |
| `LIVEKIT_PUBLIC_URL` | no | `ws://localhost:7880` | Browsers use this (wss:// via TLS proxy) |
| `API_PORT` | no | `3001` | |
| `API_HOST` | no | `0.0.0.0` | |
| `CORS_ORIGINS` | no | `http://localhost:3000` | Comma-separated |
| `POLL_INTERVAL_MS` | no | `5000` | AI bot room poll interval |
| `CONFIDENCE_THRESHOLD` | no | `0.6` | AI persona intervention threshold |
| `COOLDOWN_MS` | no | `10000` | Min ms between AI interventions |
| `RECORDINGS_DIR` | no | `./data/recordings` | API writes here |
| `LOG_LEVEL` | no | `info` | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |

## Common Issues

### Bot says "Handshake not finished" / can't join LiveKit
- **Check `LIVEKIT_URL`** uses `127.0.0.1` (not `localhost`) — IPv6 resolves first on Windows
- **Check LiveKit version**: must be ≥ 1.10 to support `@livekit/rtc-node@0.13.x`. We use 1.11.0.
- **Check UDP 7883** isn't firewalled (bot uses UDP for WebRTC media)

### Browser shows "您的連線不是私人連線"
- Self-signed cert warning. Click "進階" → "繼續前往 <ip>（不安全）"
- Once accepted, persists for the session

### `POST /api/rooms/:code/join` returns 404
- Check `allowedDevOrigins` in `apps/web/next.config.mjs` includes the LAN IP
- Restart Next.js after config changes

### AI doesn't speak (no banner appears)
- Check `STT_API_KEY` and `OPENAI_API_KEY` are set (not placeholders)
- Check bot log for `[bot:<code>] decision: ...` — should see skip or INTERVENE
- Check `CONFIDENCE_THRESHOLD` is reasonable (0.6 default)
- Check `COOLDOWN_MS` isn't too long

### Tests fail with "Cannot find module '@futuremode/shared'"
- Run `pnpm --filter @futuremode/shared build` first
- Tests import from source via vitest alias (see `vitest.config.ts`)

### TypeScript errors after pulling
- Run `pnpm install && pnpm --filter @futuremode/shared build && pnpm typecheck`

## Docker (Optional)

`docker-compose.yml` is provided but currently configured for production deployments. For local dev we run services directly. To use Docker:

```bash
docker compose up -d
# Then in each app:
docker compose exec api pnpm dev
```

## Production Deployment

- Replace dev keys (`devkey`, dev JWT secret) with production keys
- Replace self-signed certs with Let's Encrypt or corporate CA
- Set `CORS_ORIGINS` to your real domain
- Set `LIVEKIT_PUBLIC_URL` to `wss://<your-domain>:7880` (or use proper TLS via LiveKit config)
- Move recordings from JSON files to S3 + Postgres (Phase 6)
- Add Redis for multi-instance room state

## Monitoring

- API logs to stdout (pino-pretty in dev, JSON in prod)
- Bot logs to stdout
- LiveKit logs to stdout

Watch for:
- `[bot:<code>] failed to spawn worker` → connection issue
- `rate-limited` → abuse or bot misconfiguration
- `STT failed` / `LLM failed` / `TTS failed` → endpoint issues

## Backup / Restore

Recordings live in `apps/api/data/recordings/`. Back up this directory. Format is documented in `docs/api.md`.

## Scaling Beyond MVP

Current limits:
- 10 participants per room (LiveKit config)
- 1 LiveKit node (no clustering)
- In-memory roomStore (lost on API restart)
- Local JSON recordings

To scale:
1. **Redis** for roomStore (swap `roomStore.ts` implementation)
2. **LiveKit cluster mode** (multiple nodes + Redis)
3. **Postgres** for recordings + audit log
4. **S3** for recording storage
5. **TURN** server (coturn) for mobile/NAT
6. **LLM rate limiting** at edge (per-room token bucket)

## Debugging a Live Session

```bash
# All service logs in background:
tail -f /tmp/api.log /tmp/bot.log /tmp/web.log /tmp/livekit.log

# Or in separate panes with TaskOutput tool.

# Check if room exists:
curl http://localhost:3001/api/v1/rooms

# Check if recording exists:
ls apps/api/data/recordings/
cat apps/api/data/recordings/<code>.json | jq .
```

## Contact

File issues at the GitHub repo.
