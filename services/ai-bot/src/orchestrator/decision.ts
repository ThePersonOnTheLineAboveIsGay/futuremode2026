/**
 * Intervention gate: confidence threshold + cooldown timer.
 */
import type { InterventionDecision, Persona } from '@futuremode/shared';

export interface GateInput {
  decision: InterventionDecision;
  lastInterventionAt: number; // unix ms; 0 if never
  now: number;
  persona: Persona;
}

export function shouldIntervene(input: GateInput): boolean {
  const { decision, lastInterventionAt, now, persona } = input;
  if (!decision.intervene) return false;
  if (now - lastInterventionAt < persona.cooldownMs) return false;
  if (decision.confidence < persona.threshold) return false;
  if (decision.kind === 'stagnation' && decision.confidence < persona.threshold + 0.1) {
    return false;
  }
  return true;
}
