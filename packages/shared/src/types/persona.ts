/**
 * AI persona types and configurations.
 */

export type PersonaId = 'critic' | 'coach' | 'consultant';

export type ScenarioId = 'general' | 'engineering' | 'business' | 'brainstorm';

export interface Persona {
  id: PersonaId;
  displayName: string;
  description: string;
  threshold: number; // 0–1, confidence threshold
  cooldownMs: number;
  voice?: string; // OpenAI TTS voice name
}

export interface Scenario {
  id: ScenarioId;
  displayName: string;
  systemPromptAddition: string;
}

export interface PersonaConfig {
  persona: Persona;
  scenario: Scenario;
}
