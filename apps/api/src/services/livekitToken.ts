/**
 * LiveKit JWT token generation.
 * Docs: https://docs.livekit.io/home/server/token-generation/
 */
import { AccessToken } from 'livekit-server-sdk';
import { env } from '../plugins/env.js';

export interface TokenOptions {
  identity: string;
  displayName: string;
  roomName: string;
  isHost?: boolean;
  ttlSeconds?: number;
}

export async function mintLiveKitToken(opts: TokenOptions): Promise<string> {
  const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: opts.identity,
    name: opts.displayName,
    ttl: opts.ttlSeconds ?? 60 * 60, // 1 hour default
  });

  at.addGrant({
    room: opts.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Host gets moderator powers; can mute others, end room, etc.
    roomAdmin: opts.isHost ?? false,
    roomCreate: opts.isHost ?? false,
  });

  return at.toJwt();
}
