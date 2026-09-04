/**
 * Rolling context buffer: keeps the last N utterances per speaker.
 *
 * - Default: last 10 utterances OR last 5 minutes (whichever shorter) per speaker
 * - Global cap: last 50 utterances across the room (for the LLM context window)
 */
import type { Utterance } from '@futuremode/shared';

const MAX_PER_SPEAKER = 10;
const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_GLOBAL = 50;

export class ContextBuffer {
  private bySpeaker = new Map<string, Utterance[]>();
  private global: Utterance[] = [];

  add(u: Utterance): void {
    // Per-speaker
    const list = this.bySpeaker.get(u.speakerId) ?? [];
    list.push(u);
    // Trim by count
    while (list.length > MAX_PER_SPEAKER) list.shift();
    // Trim by age
    const cutoff = u.ts - MAX_AGE_MS;
    while (list.length > 0 && (list[0]?.ts ?? 0) < cutoff) list.shift();
    this.bySpeaker.set(u.speakerId, list);

    // Global
    this.global.push(u);
    while (this.global.length > MAX_GLOBAL) this.global.shift();
  }

  /** Last N utterances for a specific speaker (oldest first). */
  forSpeaker(speakerId: string): Utterance[] {
    return [...(this.bySpeaker.get(speakerId) ?? [])];
  }

  /** All utterances, oldest first, globally capped. */
  all(): Utterance[] {
    return [...this.global];
  }

  size(): number {
    return this.global.length;
  }

  clear(): void {
    this.bySpeaker.clear();
    this.global = [];
  }
}
