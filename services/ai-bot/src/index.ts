/**
 * services/ai-bot — entry point.
 *
 * Polls the Fastify API for active rooms every 5 seconds, spawns a BotWorker
 * for each room that doesn't already have one. Workers disconnect when their
 * room disappears from the active list.
 */
import { AI_BOT_IDENTITY_PREFIX } from '@futuremode/shared/constants';
import { BotWorker } from './worker/botWorker.js';
import { AccessToken } from 'livekit-server-sdk';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? API_URL;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';

const workers = new Map<string, BotWorker>();

async function mintToken(roomName: string, identity: string): Promise<string> {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: '1h',
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return at.toJwt();
}

async function fetchActiveRooms(): Promise<Array<{ code: string }>> {
  try {
    const resp = await fetch(`${INTERNAL_API_URL}/api/v1/rooms`);
    if (!resp.ok) {
      console.warn(`[ai-bot] /rooms returned ${resp.status}`);
      return [];
    }
    const data = (await resp.json()) as { rooms: Array<{ code: string }> };
    return data.rooms;
  } catch (err) {
    console.warn(`[ai-bot] failed to fetch rooms:`, err);
    return [];
  }
}

async function reconcile(): Promise<void> {
  const activeRooms = await fetchActiveRooms();
  const activeCodes = new Set(activeRooms.map((r) => r.code));

  // Spawn new workers
  for (const { code } of activeRooms) {
    if (workers.has(code)) continue;
    try {
      const w = new BotWorker(code, { mintToken });
      await w.start();
      workers.set(code, w);
      console.log(`[ai-bot] spawned worker for room ${code}`);
    } catch (err) {
      console.error(`[ai-bot] failed to spawn worker for ${code}:`, err);
    }
  }

  // Stop workers for inactive rooms
  for (const [code, worker] of workers.entries()) {
    if (!activeCodes.has(code)) {
      console.log(`[ai-bot] stopping worker for inactive room ${code}`);
      void worker.stop();
      workers.delete(code);
    }
  }
}

async function main() {
  console.log(
    `[ai-bot] starting (identity prefix: ${AI_BOT_IDENTITY_PREFIX}, api: ${INTERNAL_API_URL})`,
  );

  if (!process.env.OPENAI_API_KEY) {
    console.warn(`[ai-bot] WARNING: OPENAI_API_KEY not set; STT/LLM/TTS will fail`);
  }
  if (!LIVEKIT_API_SECRET) {
    console.error(`[ai-bot] FATAL: LIVEKIT_API_SECRET not set`);
    process.exit(1);
  }

  // Initial reconcile + periodic poll
  void reconcile();
  setInterval(() => void reconcile(), POLL_INTERVAL_MS);

  console.log(`[ai-bot] polling every ${POLL_INTERVAL_MS}ms`);
}

main().catch((err) => {
  console.error('[ai-bot] fatal:', err);
  process.exit(1);
});
