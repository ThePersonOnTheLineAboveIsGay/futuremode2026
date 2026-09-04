/**
 * AI state machine for one room.
 *
 * IDLE → (utterance) → ANALYZING → DECIDING → (gate) → SPEAKING → COOLDOWN → IDLE
 */
import { EventEmitter } from 'node:events';
import type {
  InterventionDecision,
  InterventionLog,
  Persona,
  Scenario,
  Utterance,
} from '@futuremode/shared';
import { DEFAULT_PERSONAS, DEFAULT_SCENARIOS } from '@futuremode/shared';
import { decide } from '../ai/llm.js';
import { speak, type SpeakChunk } from '../ai/tts.js';
import { shouldIntervene } from './decision.js';
import { ContextBuffer } from './contextBuffer.js';

export type OrchestratorEvent =
  | { type: 'utterance'; utterance: Utterance }
  | { type: 'intervention_start'; text: string }
  | { type: 'intervention_end'; log: InterventionLog }
  | { type: 'decision'; decision: InterventionDecision; triggeredByUtteranceId: string };

type SpeakFn = (text: string) => AsyncGenerator<SpeakChunk>;

export interface OrchestratorDeps {
  /** Inject TTS generator (so worker can use LiveKit AudioSource). */
  speak: SpeakFn;
  /** Persist intervention log. */
  persistIntervention: (log: InterventionLog) => Promise<void>;
}

export class Orchestrator {
  private emitter = new EventEmitter();
  private buffer = new ContextBuffer();
  private persona: Persona = DEFAULT_PERSONAS.critic;
  private scenario: Scenario = DEFAULT_SCENARIOS.general;
  private lastInterventionAt = 0;
  private state: 'IDLE' | 'ANALYZING' | 'SPEAKING' | 'COOLDOWN' = 'IDLE';
  private speaking = false;

  constructor(private deps: OrchestratorDeps) {}

  on(event: 'utterance' | 'intervention_start' | 'intervention_end' | 'decision', cb: (...args: unknown[]) => void): this {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.emitter.on(event, cb as any);
    return this;
  }

  setPersona(id: Persona['id']) {
    this.persona = DEFAULT_PERSONAS[id];
  }

  setScenario(id: Scenario['id']) {
    this.scenario = DEFAULT_SCENARIOS[id];
  }

  getPersona(): Persona {
    return this.persona;
  }

  getScenario(): Scenario {
    return this.scenario;
  }

  /**
   * Push a new utterance. Triggers the analysis pipeline.
   */
  async pushUtterance(u: Utterance): Promise<void> {
    this.buffer.add(u);
    this.emitter.emit('utterance', u);

    if (this.state !== 'IDLE') {
      // Skip overlapping analysis. Will catch up on next utterance.
      return;
    }
    await this.analyze(u);
  }

  private async analyze(u: Utterance): Promise<void> {
    this.state = 'ANALYZING';
    try {
      const context = this.buffer.all();
      const recentSpeakers = context.slice(-20);
      const result = await decide({
        persona: this.persona,
        scenario: this.scenario,
        recentUtterances: recentSpeakers,
        latestUtterance: u,
      });

      this.emitter.emit('decision', result.decision, u.id);

      const gate = shouldIntervene({
        decision: result.decision,
        lastInterventionAt: this.lastInterventionAt,
        now: Date.now(),
        persona: this.persona,
      });

      if (gate && result.decision.spokenResponse) {
        await this.speak(
          u,
          result.decision,
          result.durationMs,
          result.decision.spokenResponse,
        );
      } else {
        this.state = 'IDLE';
      }
    } catch (err) {
      console.error('[orchestrator] analyze failed:', err);
      this.state = 'IDLE';
    }
  }

  private async speak(
    u: Utterance,
    decision: InterventionDecision,
    llmDurationMs: number,
    text: string,
  ): Promise<void> {
    this.state = 'SPEAKING';
    this.emitter.emit('intervention_start', text);

    const start = Date.now();
    try {
      for await (const _chunk of this.deps.speak(text)) {
        if (!this.speaking) break;
        // The actual PCM pushing happens inside speak() via LiveKit AudioSource.
        // Worker registers its own speak() that pushes chunks.
      }
    } catch (err) {
      console.error('[orchestrator] speak failed:', err);
    }

    const log: InterventionLog = {
      id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: start,
      personaId: this.persona.id,
      scenarioId: this.scenario.id,
      kind: decision.kind,
      text,
      confidence: decision.confidence,
      triggeredByUtteranceId: u.id,
      latencyMs: {
        stt: 0, // filled by audioPipeline before pushing utterance
        llm: llmDurationMs,
        tts: Date.now() - start,
        total: Date.now() - u.ts,
      },
    };

    this.lastInterventionAt = start;
    this.emitter.emit('intervention_end', log);
    await this.deps.persistIntervention(log);

    // Start cooldown
    this.state = 'COOLDOWN';
    setTimeout(() => {
      this.state = 'IDLE';
    }, this.persona.cooldownMs);
  }

  /**
   * Stop current speaking (used for barge-in).
   */
  stopSpeaking(): void {
    this.speaking = false;
  }
}
