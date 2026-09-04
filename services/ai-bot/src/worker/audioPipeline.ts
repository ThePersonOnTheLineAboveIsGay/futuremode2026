/**
 * Audio pipeline for one participant's audio track.
 *
 * Receives PCM frames → runs VAD → on utterance end, transcribes via Whisper
 * → emits Utterance event.
 */
import { EventEmitter } from 'node:events';
import { EnergyVad } from '../utils/vad.js';
import { transcribe, type TranscribeResult } from '../ai/stt.js';
import type { Utterance } from '@futuremode/shared';

export interface AudioPipelineEvents {
  utterance: (u: Utterance) => void;
}

const MIN_UTTERANCE_MS = 300;
const MAX_UTTERANCE_MS = 30_000;

export class AudioPipeline extends EventEmitter {
  private vad: EnergyVad;
  private buffer: Int16Array[] = [];
  private bufferMs = 0;
  private readonly sampleRate: number;
  private readonly speakerId: string;
  private readonly speakerName: string;
  private processing = false;

  constructor(opts: { speakerId: string; speakerName: string; sampleRate?: number }) {
    super();
    this.speakerId = opts.speakerId;
    this.speakerName = opts.speakerName;
    this.sampleRate = opts.sampleRate ?? 48000;
    this.vad = new EnergyVad({ sampleRate: this.sampleRate, silenceMs: 700 });
  }

  async feedFrame(pcm: Int16Array): Promise<void> {
    const result = this.vad.process(pcm);

    if (result.isSpeech) {
      this.buffer.push(pcm);
      this.bufferMs += (pcm.length / this.sampleRate) * 1000;
    }

    if (this.vad.isUtteranceEnd() && this.buffer.length > 0) {
      if (this.bufferMs > MAX_UTTERANCE_MS) {
        await this.flush(true);
      } else if (this.bufferMs >= MIN_UTTERANCE_MS) {
        await this.flush(false);
      } else {
        this.clearBuffer();
        this.vad.reset();
      }
    } else if (this.bufferMs > MAX_UTTERANCE_MS) {
      await this.flush(true);
    }
  }

  private async flush(truncated: boolean): Promise<void> {
    if (this.processing) return;
    if (this.buffer.length === 0) return;
    this.processing = true;

    const totalSamples = this.buffer.reduce((sum, f) => sum + f.length, 0);
    const combined = new Int16Array(totalSamples);
    let offset = 0;
    for (const f of this.buffer) {
      combined.set(f, offset);
      offset += f.length;
    }
    this.clearBuffer();
    this.vad.reset();

    try {
      const result: TranscribeResult = await transcribe({
        pcm: combined,
        sampleRate: this.sampleRate,
        language: 'zh',
      });

      const text = result.text?.trim();
      if (text && text.length > 0) {
        const utterance: Utterance = {
          id: `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ts: Date.now(),
          speakerId: this.speakerId,
          speakerName: this.speakerName,
          text: truncated ? text + '…' : text,
          confidence: 1,
          durationMs: this.bufferMs,
        };
        this.emit('utterance', utterance);
      }
    } catch (err) {
      console.error(`[audioPipeline:${this.speakerId}] STT failed:`, err);
    } finally {
      this.processing = false;
    }
  }

  private clearBuffer() {
    this.buffer = [];
    this.bufferMs = 0;
  }

  async finalize(): Promise<void> {
    if (this.buffer.length > 0) {
      await this.flush(false);
    }
  }
}
