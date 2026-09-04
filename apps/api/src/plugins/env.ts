/**
 * Env validation + singleton. Fail-fast at boot if misconfigured.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  API_PORT: z.coerce.number().int().positive().default(3001),
  API_HOST: z.string().default('0.0.0.0'),

  // CORS: comma-separated list of origins; "*" allowed in dev only.
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // LiveKit
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(32, 'LIVEKIT_API_SECRET must be ≥ 32 chars'),
  /** Internal URL — used by API server / AI bot to connect to LiveKit SFU. */
  LIVEKIT_URL: z.string().url(),
  /** Public URL — returned to browser clients. Must be reachable from clients. */
  LIVEKIT_PUBLIC_URL: z.string().url().optional(),

  // Capacity
  MAX_PARTICIPANTS: z.coerce.number().int().positive().default(10),

  // Recordings (Phase 4+)
  RECORDINGS_DIR: z.string().default('./data/recordings'),
  RECORDING_TTL_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | undefined;

/**
 * Load env (called once at boot). Subsequent calls are no-ops.
 */
export function loadEnv(): Env {
  if (_env) return _env;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

/**
 * Eagerly load env at import-time so consumers can import `env` directly.
 * (loadEnv is idempotent.)
 */
export const env: Env = loadEnv();
