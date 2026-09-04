/**
 * OpenAI TTS streaming.
 *
 * Yields PCM Int16 chunks (24kHz mono) suitable for LiveKit AudioSource.
 */
import { getOpenAI } from './openai.js';

export interface SpeakOptions {
  text: string;
  voice?: string;
  model?: string;
  /** Sample rate of the output. OpenAI TTS PCM is 24kHz. */
  sampleRate?: number;
}

export interface SpeakChunk {
  pcm: Int16Array;
  sampleRate: number;
}

export async function* speak(opts: SpeakOptions): AsyncGenerator<SpeakChunk> {
  const openai = getOpenAI();
  const stream = await openai.audio.speech.create({
    model: opts.model ?? process.env.OPENAI_TTS_MODEL ?? 'tts-1',
    voice: (opts.voice ?? process.env.OPENAI_TTS_VOICE ?? 'onyx') as 'onyx' | 'alloy' | 'echo' | 'fable' | 'nova' | 'shimmer',
    input: opts.text,
    response_format: 'pcm',
  });

  // OpenAI returns 24kHz mono Int16 PCM
  const sampleRate = opts.sampleRate ?? 24000;
  const reader = stream.body?.getReader();
  if (!reader) throw new Error('TTS stream has no body');

  const buffer: number[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      for (let i = 0; i < value.byteLength; i += 2) {
        buffer.push(view.getInt16(i, true)); // true = little-endian
      }
      // Yield ~20ms chunks (480 samples @ 24kHz)
      const CHUNK_SAMPLES = 480;
      while (buffer.length >= CHUNK_SAMPLES) {
        const chunk = new Int16Array(buffer.splice(0, CHUNK_SAMPLES));
        yield { pcm: chunk, sampleRate };
      }
    }
  }
  // Flush remainder
  if (buffer.length > 0) {
    yield { pcm: new Int16Array(buffer), sampleRate };
  }
}
