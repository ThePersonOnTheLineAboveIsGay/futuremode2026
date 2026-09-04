/**
 * Per-room recorder: writes utterances and interventions to the Fastify API.
 */
import type { InterventionLog, Participant, Utterance } from '@futuremode/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
// AI bot talks to API server directly (server-side, no Next.js proxy needed)
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? API_URL;

export class Recorder {
  constructor(private roomCode: string) {}

  async upsertParticipant(p: Participant): Promise<void> {
    try {
      await fetch(`${INTERNAL_API_URL}/api/v1/rooms/${this.roomCode}/participants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(p),
      });
    } catch (err) {
      console.warn(`[recorder] failed to upsert participant:`, err);
    }
  }

  async appendUtterance(u: Utterance): Promise<void> {
    try {
      await fetch(`${INTERNAL_API_URL}/api/v1/rooms/${this.roomCode}/utterances`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(u),
      });
    } catch (err) {
      console.warn(`[recorder] failed to append utterance:`, err);
    }
  }

  async appendIntervention(i: InterventionLog): Promise<void> {
    try {
      await fetch(`${INTERNAL_API_URL}/api/v1/rooms/${this.roomCode}/interventions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(i),
      });
    } catch (err) {
      console.warn(`[recorder] failed to append intervention:`, err);
    }
  }
}
