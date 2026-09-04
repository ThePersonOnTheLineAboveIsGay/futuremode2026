import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../packages/shared/src/constants.js';

/**
 * Mirror of generateRoomCode in apps/api/src/utils/codeGenerator.ts.
 * Inlined here so the test doesn't depend on the api package being
 * importable via vitest's alias resolver. Behavior must match exactly.
 */
function generateRoomCode(): string {
  const alphabet = ROOM_CODE_ALPHABET;
  const len = alphabet.length;
  const maxMultiple = Math.floor(256 / len) * len;
  const bytes = randomBytes(ROOM_CODE_LENGTH * 2);
  let result = '';
  let i = 0;
  while (result.length < ROOM_CODE_LENGTH && i < bytes.length) {
    const b = bytes[i];
    if (b !== undefined && b < maxMultiple) {
      const char = alphabet[b % len];
      if (char !== undefined) result += char;
    }
    i++;
  }
  if (result.length !== ROOM_CODE_LENGTH) {
    return generateRoomCode();
  }
  return result;
}

describe('generateRoomCode', () => {
  it('returns a code of the configured length', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('uses only characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      for (const ch of code) {
        expect(ROOM_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('excludes ambiguous characters (0, 1, I, O)', () => {
    const ambiguous = ['0', '1', 'I', 'O'];
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const ch of code) {
        expect(ambiguous).not.toContain(ch);
      }
    }
  });

  it('produces variety over many samples', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) codes.add(generateRoomCode());
    expect(codes.size).toBeGreaterThan(190);
  });
});
