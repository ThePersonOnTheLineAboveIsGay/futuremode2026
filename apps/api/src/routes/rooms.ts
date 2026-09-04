/**
 * /rooms — Create / list rooms.
 */
import type { FastifyInstance } from 'fastify';
import type { CreateRoomResponse, RoomCode } from '@futuremode/shared';
import { generateRoomCode } from '../utils/codeGenerator.js';
import { mintLiveKitToken } from '../services/livekitToken.js';
import { roomStore } from '../services/roomStore.js';
import { CreateRoomRequestSchema, JoinRoomRequestSchema } from '../schemas/room.js';
import { env } from '../plugins/env.js';

const MAX_CODE_GENERATION_ATTEMPTS = 5;

function listActiveRooms() {
  return roomStore.list().map((r) => ({
    code: r.code,
    createdAt: r.createdAt,
    participantCount: r.participantCount,
  }));
}

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /rooms
   * Create a new room and return a host token.
   */
  app.post('/rooms', async (req, reply) => {
    const parse = CreateRoomRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: parse.error.flatten() });
    }
    const { displayName } = parse.data;

    // Try a few times in case of collision.
    let code: RoomCode | undefined;
    for (let i = 0; i < MAX_CODE_GENERATION_ATTEMPTS; i++) {
      const candidate = generateRoomCode();
      if (!roomStore.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return reply.code(500).send({ error: 'code_collision', message: 'failed to generate unique code' });
    }

    // The host becomes the first participant.
    const hostIdentity = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    roomStore.create(code, hostIdentity);
    roomStore.addParticipant(code, {
      identity: hostIdentity,
      displayName,
      joinedAt: Date.now(),
    });

    const token = await mintLiveKitToken({
      identity: hostIdentity,
      displayName,
      roomName: code,
      isHost: true,
    });

    const body: CreateRoomResponse = {
      code,
      token,
      identity: hostIdentity,
      livekitUrl: env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL,
    };
    return reply.code(201).send(body);
  });

  /**
   * POST /rooms/:code/join
   * Join an existing room and receive a participant token.
   */
  app.post<{ Params: { code: string } }>('/rooms/:code/join', async (req, reply) => {
    const parse = JoinRoomRequestSchema.safeParse({
      code: req.params.code,
      displayName: (req.body as { displayName?: string })?.displayName,
    });
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_request', issues: parse.error.flatten() });
    }
    const { code, displayName } = parse.data;

    if (!roomStore.has(code)) {
      return reply.code(404).send({ error: 'room_not_found' });
    }

    const identity = `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const added = roomStore.addParticipant(code, {
      identity,
      displayName,
      joinedAt: Date.now(),
    });
    if (!added) {
      return reply.code(409).send({ error: 'room_full' });
    }

    const token = await mintLiveKitToken({
      identity,
      displayName,
      roomName: code,
      isHost: false,
    });

    return reply.send({
      code,
      token,
      identity,
      livekitUrl: env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL,
      participants: roomStore.listParticipants(code),
    });
  });

  /**
   * GET /rooms
   * List active rooms (used by AI bot to discover rooms to join).
   */
  app.get('/rooms', async (_req, reply) => {
    return reply.send({ rooms: listActiveRooms() });
  });

  /**
   * GET /rooms/:code
   * Lightweight metadata (does NOT mint a token).
   */
  app.get<{ Params: { code: string } }>('/rooms/:code', async (req, reply) => {
    const room = roomStore.get(req.params.code);
    if (!room) {
      return reply.code(404).send({ error: 'room_not_found' });
    }
    return reply.send({
      ...room,
      participants: roomStore.listParticipants(req.params.code),
    });
  });

  /**
   * GET /config
   * Returns public-facing configuration (e.g., LiveKit URL) the browser needs.
   * This avoids hard-coding NEXT_PUBLIC_LIVEKIT_URL on the frontend.
   */
  app.get('/config', async (_req, reply) => {
    return reply.send({
      livekitUrl: env.LIVEKIT_PUBLIC_URL ?? env.LIVEKIT_URL,
    });
  });

  /**
   * DELETE /rooms/:code
   * End the room. Host-only enforced via API gateway / future auth.
   */
  app.delete<{ Params: { code: string } }>('/rooms/:code', async (req, reply) => {
    if (!roomStore.has(req.params.code)) {
      return reply.code(404).send({ error: 'room_not_found' });
    }
    roomStore.endRoom(req.params.code);
    return reply.code(204).send();
  });
}
