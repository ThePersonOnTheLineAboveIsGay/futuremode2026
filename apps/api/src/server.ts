/**
 * apps/api — Fastify server.
 *
 * Phase 1: room creation, token signing, health.
 * Phase 4: recordings endpoints.
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { env, loadEnv } from './plugins/env.js';
import { roomRoutes } from './routes/rooms.js';
import { recordingRoutes } from './routes/recordings.js';

async function buildServer() {
  loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
    trustProxy: true,
  });

  // CORS — allow the frontend origin (Next.js dev server).
  await app.register(cors, {
    origin: env.CORS_ORIGINS.split(',').map((s: string) => s.trim()),
    credentials: true,
  });

  // Basic security headers.
  await app.register(helmet, {
    contentSecurityPolicy: false, // dev-friendly; tighten in prod
  });

  // Rate limit — prevent room-code brute-forcing and abuse.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    allowList: [],
  });

  // Health
  app.get('/health', async () => ({
    status: 'ok',
    service: 'api',
    phase: 'Phase 1 — basic video + room mgmt',
    timestamp: new Date().toISOString(),
  }));

  // Routes
  await app.register(roomRoutes, { prefix: '/api/v1' });
  await app.register(recordingRoutes, { prefix: '/api/v1' });

  return app;
}

async function main() {
  try {
    const app = await buildServer();
    await app.listen({ port: env.API_PORT, host: env.API_HOST });
    app.log.info(`api listening on http://${env.API_HOST}:${env.API_PORT}`);
  } catch (err) {
    console.error('Failed to start api:', err);
    process.exit(1);
  }
}

main();
