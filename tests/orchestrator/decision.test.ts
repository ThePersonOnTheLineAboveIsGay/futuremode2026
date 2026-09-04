import { describe, expect, it } from 'vitest';

/**
 * Decision-logic tests for the AI orchestrator.
 * Will be expanded in Phase 3 when the orchestrator is implemented.
 * For now, tests the gate semantics we expect.
 */

interface Decision {
  intervene: boolean;
  confidence: number;
  kind: 'contradiction' | 'off_topic' | 'stagnation' | 'unreasonable' | 'none';
}

function shouldIntervene(
  d: Decision,
  lastInterventionAt: number,
  now: number,
  cooldownMs: number,
  threshold: number,
): boolean {
  if (now - lastInterventionAt < cooldownMs) return false;
  if (d.confidence < threshold) return false;
  if (d.kind === 'stagnation') return d.confidence >= threshold + 0.1;
  return d.intervene;
}

describe('shouldIntervene gate', () => {
  it('blocks during cooldown', () => {
    const result = shouldIntervene(
      { intervene: true, confidence: 0.9, kind: 'contradiction' },
      1000,
      1000 + 5000, // 5s elapsed, cooldown 10s
      10_000,
      0.6,
    );
    expect(result).toBe(false);
  });

  it('allows after cooldown', () => {
    const result = shouldIntervene(
      { intervene: true, confidence: 0.9, kind: 'contradiction' },
      1000,
      1000 + 11_000, // 11s elapsed
      10_000,
      0.6,
    );
    expect(result).toBe(true);
  });

  it('blocks when confidence is below threshold', () => {
    const result = shouldIntervene(
      { intervene: true, confidence: 0.5, kind: 'contradiction' },
      0,
      1_000_000,
      10_000,
      0.6,
    );
    expect(result).toBe(false);
  });

  it('stagnation requires higher threshold', () => {
    const justBelow = shouldIntervene(
      { intervene: true, confidence: 0.65, kind: 'stagnation' },
      0,
      1_000_000,
      10_000,
      0.6,
    );
    expect(justBelow).toBe(false);

    const justAbove = shouldIntervene(
      { intervene: true, confidence: 0.71, kind: 'stagnation' },
      0,
      1_000_000,
      10_000,
      0.6,
    );
    expect(justAbove).toBe(true);
  });

  it('respects intervene=false even with high confidence', () => {
    const result = shouldIntervene(
      { intervene: false, confidence: 0.95, kind: 'none' },
      0,
      1_000_000,
      10_000,
      0.6,
    );
    expect(result).toBe(false);
  });
});
