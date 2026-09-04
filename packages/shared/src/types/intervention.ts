/**
 * AI intervention types.
 */

import type { PersonaId, ScenarioId } from './persona.js';

export type InterventionKind =
  | 'contradiction'
  | 'off_topic'
  | 'stagnation'
  | 'unreasonable'
  | 'none';

export interface InterventionDecision {
  intervene: boolean;
  confidence: number; // 0–1
  kind: InterventionKind;
  spokenResponse?: string; // 繁體中文，1–2 句
  reason?: string; // internal one-liner
}

export interface InterventionLog {
  id: string;
  ts: number;
  personaId: PersonaId;
  scenarioId: ScenarioId;
  kind: InterventionKind;
  text: string; // what AI said
  confidence: number;
  triggeredByUtteranceId?: string;
  latencyMs?: {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
}

export interface InterventionEvent {
  type: 'intervention_start' | 'intervention_end' | 'intervention_decision';
  data: InterventionLog | InterventionDecision;
}
