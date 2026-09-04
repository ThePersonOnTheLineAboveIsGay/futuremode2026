/**
 * Transcript-related types.
 */

export interface Utterance {
  id: string;
  ts: number; // unix ms
  speakerId: string; // participant identity
  speakerName: string;
  text: string;
  confidence?: number; // 0–1, from Whisper
  durationMs?: number;
}

export interface TranscriptSegment {
  utterances: Utterance[];
}

export type TranscriptEvent =
  | { type: 'utterance'; data: Utterance }
  | { type: 'clear'; data: { ts: number } };
