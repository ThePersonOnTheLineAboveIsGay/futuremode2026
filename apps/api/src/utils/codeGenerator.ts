/**
 * Generates a 6-character base32 room code using an alphabet
 * that excludes ambiguous characters (0/O, 1/I/L).
 *
 * Uses crypto.randomBytes for unbiased selection.
 */
import { randomBytes } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@futuremode/shared/constants';

/**
 * Generate a random room code. May return duplicates; caller is responsible
 * for checking against the room store and retrying.
 */
export function generateRoomCode(): string {
  const alphabet = ROOM_CODE_ALPHABET;
  const len = alphabet.length; // 32 (we pre-filtered to 32 unique chars)
  // Reject-sampling to avoid modulo bias.
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
    // Extremely unlikely; retry once with fresh randomness.
    return generateRoomCode();
  }
  return result;
}
