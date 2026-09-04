import { describe, expect, it } from 'vitest';
import { ROOM_CODE_LENGTH, MAX_PARTICIPANTS_MVP, DEFAULT_PERSONAS } from '../../packages/shared/src/constants.js';

describe('shared constants', () => {
  it('room code length is 6', () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
  });

  it('max participants is 10 for MVP', () => {
    expect(MAX_PARTICIPANTS_MVP).toBe(10);
  });

  it('all three personas have required fields', () => {
    for (const [id, p] of Object.entries(DEFAULT_PERSONAS)) {
      expect(p.id).toBe(id);
      expect(p.displayName.length).toBeGreaterThan(0);
      expect(p.threshold).toBeGreaterThan(0);
      expect(p.threshold).toBeLessThanOrEqual(1);
      expect(p.cooldownMs).toBeGreaterThan(0);
    }
  });

  it('persona thresholds are ordered critic ≤ consultant ≤ coach', () => {
    expect(DEFAULT_PERSONAS.critic.threshold).toBeLessThanOrEqual(DEFAULT_PERSONAS.consultant.threshold);
    expect(DEFAULT_PERSONAS.consultant.threshold).toBeLessThanOrEqual(DEFAULT_PERSONAS.coach.threshold);
  });
});
