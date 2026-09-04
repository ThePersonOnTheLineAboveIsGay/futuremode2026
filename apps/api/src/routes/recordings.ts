import type { FastifyInstance } from 'fastify';
import {
  appendIntervention,
  appendUtterance,
  endRecording,
  ensureRecording,
  getRecording,
  upsertParticipant,
} from '../services/recordingStore.js';
import type {
  InterventionLog,
  Participant,
  Utterance,
} from '@futuremode/shared';
import { z } from 'zod';

const ParticipantSchema = z.object({
  identity: z.string().min(1),
  displayName: z.string().min(1),
  joinedAt: z.number(),
  leftAt: z.number().optional(),
  isAI: z.boolean().optional(),
});

const UtteranceSchema = z.object({
  id: z.string().min(1),
  ts: z.number(),
  speakerId: z.string().min(1),
  speakerName: z.string().min(1),
  text: z.string().min(1),
  confidence: z.number().optional(),
  durationMs: z.number().optional(),
});

const InterventionSchema = z.object({
  id: z.string().min(1),
  ts: z.number(),
  personaId: z.enum(['critic', 'coach', 'consultant']),
  scenarioId: z.enum(['general', 'engineering', 'business', 'brainstorm']),
  kind: z.enum(['contradiction', 'off_topic', 'stagnation', 'unreasonable', 'none']),
  text: z.string().min(1),
  confidence: z.number(),
  triggeredByUtteranceId: z.string().optional(),
  latencyMs: z
    .object({
      stt: z.number(),
      llm: z.number(),
      tts: z.number(),
      total: z.number(),
    })
    .optional(),
});

export async function recordingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /recordings/:code
   * Returns the full recording JSON.
   */
  app.get<{ Params: { code: string } }>('/recordings/:code', async (req, reply) => {
    const rec = await getRecording(req.params.code);
    if (!rec) {
      return reply.code(404).send({ error: 'recording_not_found' });
    }
    return reply.send(rec);
  });

  /**
   * POST /rooms/:code/participants
   * Bot calls this when a participant joins.
   */
  app.post<{ Params: { code: string }; Body: Participant }>(
    '/rooms/:code/participants',
    async (req, reply) => {
      const parse = ParticipantSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parse.error.flatten() });
      }
      await ensureRecording(req.params.code);
      await upsertParticipant(req.params.code, parse.data);
      return reply.code(204).send();
    },
  );

  /**
   * POST /rooms/:code/utterances
   * Bot calls this after each STT.
   */
  app.post<{ Params: { code: string }; Body: Utterance }>(
    '/rooms/:code/utterances',
    async (req, reply) => {
      const parse = UtteranceSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parse.error.flatten() });
      }
      await appendUtterance(req.params.code, parse.data);
      return reply.code(204).send();
    },
  );

  /**
   * POST /rooms/:code/interventions
   * Bot calls this after each AI speak.
   */
  app.post<{ Params: { code: string }; Body: InterventionLog }>(
    '/rooms/:code/interventions',
    async (req, reply) => {
      const parse = InterventionSchema.safeParse(req.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'invalid_body', issues: parse.error.flatten() });
      }
      await appendIntervention(req.params.code, parse.data);
      return reply.code(204).send();
    },
  );

  /**
   * DELETE /recordings/:code — finalize and remove cached recording.
   */
  app.delete<{ Params: { code: string } }>('/recordings/:code', async (req, reply) => {
    await endRecording(req.params.code);
    return reply.code(204).send();
  });
}
