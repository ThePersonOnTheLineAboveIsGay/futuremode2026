import { z } from 'zod';

export const CreateRoomRequestSchema = z.object({
  displayName: z.string().min(1).max(64),
});

export const JoinRoomRequestSchema = z.object({
  code: z.string().length(6).regex(/^[2-9A-HJ-NP-Z]{6}$/, 'invalid room code'),
  displayName: z.string().min(1).max(64),
});

export type CreateRoomRequest = z.infer<typeof CreateRoomRequestSchema>;
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
