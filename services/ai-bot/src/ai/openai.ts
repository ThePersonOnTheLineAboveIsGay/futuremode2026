/**
 * Shared OpenAI client for LLM + TTS.
 *
 * Reads OPENAI_API_URL (optional, defaults to OpenAI official) and OPENAI_API_KEY.
 * STT uses a SEPARATE client — see stt.ts.
 */
import OpenAI from 'openai';

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY must be set');
  }
  const url = process.env.OPENAI_API_URL?.trim();
  _client = new OpenAI({
    apiKey: key,
    baseURL: url && url.length > 0 ? url : undefined,
  });
  return _client;
}
