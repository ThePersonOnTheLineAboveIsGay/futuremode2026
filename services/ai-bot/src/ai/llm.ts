/**
 * GPT LLM wrapper with JSON mode.
 *
 * Builds prompt from persona + scenario + rolling context, returns InterventionDecision.
 */
import { getOpenAI } from './openai.js';
import type { InterventionDecision, Persona, Scenario, Utterance } from '@futuremode/shared';
import { criticPrompt } from './prompts/critic.js';
import { coachPrompt } from './prompts/coach.js';
import { consultantPrompt } from './prompts/consultant.js';

const PERSONA_PROMPTS = {
  critic: criticPrompt,
  coach: coachPrompt,
  consultant: consultantPrompt,
} as const;

function buildSystemPrompt(persona: Persona, scenario: Scenario): string {
  return PERSONA_PROMPTS[persona.id](scenario);
}

export interface DecideOptions {
  persona: Persona;
  scenario: Scenario;
  /** Recent utterances, oldest first. */
  recentUtterances: Utterance[];
  /** The utterance that just completed — the one to evaluate. */
  latestUtterance: Utterance;
}

export interface DecideResult {
  decision: InterventionDecision;
  durationMs: number;
}

export async function decide(opts: DecideOptions): Promise<DecideResult> {
  const start = Date.now();
  const openai = getOpenAI();

  const systemPrompt = buildSystemPrompt(opts.persona, opts.scenario);
  const contextStr = opts.recentUtterances
    .map((u) => `[${new Date(u.ts).toLocaleTimeString('zh-TW')}] ${u.speakerName}: ${u.text}`)
    .join('\n');

  const userMsg = JSON.stringify({
    context: contextStr,
    currentSpeaker: opts.latestUtterance.speakerName,
    currentUtterance: opts.latestUtterance.text,
  });

  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 300,
  });

  const content = resp.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(content) as InterventionDecision;

  return {
    decision: {
      intervene: Boolean(parsed.intervene),
      confidence: Number(parsed.confidence) || 0,
      kind: parsed.kind ?? 'none',
      spokenResponse: parsed.spokenResponse,
      reason: parsed.reason,
    },
    durationMs: Date.now() - start,
  };
}
