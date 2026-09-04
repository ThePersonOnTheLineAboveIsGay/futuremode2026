/**
 * Whisper STT wrapper.
 *
 * Uses a SEPARATE OpenAI-compatible endpoint (e.g. self-hosted faster-whisper-server).
 * Reads STT_API_URL + STT_API_KEY from env. Falls back to OPENAI_API_KEY only if
 * STT vars are not set (for dev convenience — production should set them explicitly).
 *
 * Takes raw PCM (Int16 LE, mono, 48kHz) → wraps in WAV → uploads to /audio/transcriptions.
 * Returns { text, language }.
 */
import OpenAI from 'openai';
import { Buffer } from 'node:buffer';

export interface TranscribeOptions {
  /** PCM samples, Int16 little-endian, mono, 48kHz. */
  pcm: Int16Array;
  sampleRate: number;
  language?: string;
  /** Hint passed as initial prompt to improve accuracy. */
  prompt?: string;
}

export interface TranscribeResult {
  text: string;
  language?: string;
  durationMs: number;
}

/**
 * Wrap raw PCM samples in a minimal WAV header so Whisper accepts them.
 */
function pcmToWav(pcm: Int16Array, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataLength = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);

  for (let i = 0; i < pcm.length; i++) {
    buffer.writeInt16LE(pcm[i] ?? 0, 44 + i * 2);
  }
  return buffer;
}

let _sttClient: OpenAI | null = null;

function getSttClient(): OpenAI {
  if (_sttClient) return _sttClient;
  const url = process.env.STT_API_URL;
  const key = process.env.STT_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('STT_API_KEY or OPENAI_API_KEY must be set');
  }
  _sttClient = new OpenAI({
    apiKey: key,
    baseURL: url || undefined, // undefined → default OpenAI endpoint
  });
  return _sttClient;
}

export async function transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
  const start = Date.now();
  const wav = pcmToWav(opts.pcm, opts.sampleRate);

  const file = new File([new Uint8Array(wav)], 'audio.wav', { type: 'audio/wav' });
  const client = getSttClient();

  const resp = await client.audio.transcriptions.create({
    file,
    model: process.env.STT_MODEL ?? 'whisper-1',
    language: opts.language ?? 'zh',
    response_format: 'verbose_json',
    prompt: opts.prompt,
  });

  return {
    text: (resp as { text: string }).text ?? '',
    language: (resp as { language?: string }).language,
    durationMs: Date.now() - start,
  };
}
