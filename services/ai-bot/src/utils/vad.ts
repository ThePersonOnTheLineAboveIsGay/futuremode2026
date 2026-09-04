/**
 * Energy-based Voice Activity Detection (VAD).
 *
 * Pure TypeScript, no native dependencies — works on any platform.
 * Computes RMS (root mean square) of 16-bit PCM frames and flags speech
 * when energy crosses an adaptive threshold.
 *
 * For MVP this is good enough. Phase 5+ can swap to WebRTC VAD if needed.
 */

export interface VadOptions {
  /** Sample rate in Hz. LiveKit audio is 48k. */
  sampleRate: number;
  /** Frame duration in ms (10, 20, or 30). */
  frameMs?: number;
  /** Energy threshold (0–1) for speech detection. Auto-calibrates on init. */
  energyThreshold?: number;
  /** How long continuous silence before considering an utterance ended (ms). */
  silenceMs?: number;
}

export interface VadResult {
  /** Is the current frame classified as speech? */
  isSpeech: boolean;
  /** Current frame energy (0–1). */
  energy: number;
  /** Milliseconds of continuous silence preceding the current frame. */
  silenceMs: number;
}

export class EnergyVad {
  private readonly sampleRate: number;
  private readonly frameSamples: number;
  private threshold: number;
  private silenceAcc = 0;
  private noiseFloor = 0;
  private noiseCalibrated = false;
  private calibrationSamples = 0;
  private readonly silenceThresholdMs: number;
  private readonly frameMs: number;

  constructor(opts: VadOptions) {
    this.sampleRate = opts.sampleRate;
    this.frameMs = opts.frameMs ?? 20;
    this.frameSamples = (this.sampleRate * this.frameMs) / 1000;
    this.threshold = opts.energyThreshold ?? 0.02;
    this.silenceThresholdMs = opts.silenceMs ?? 700;
  }

  /** Feed one PCM frame (Int16, mono). Returns classification. */
  process(pcm: Int16Array): VadResult {
    const energy = this.rms(pcm);

    // First ~30 frames: calibrate noise floor (assume the speaker hasn't started).
    if (!this.noiseCalibrated) {
      this.noiseFloor = (this.noiseFloor * this.calibrationSamples + energy) / (this.calibrationSamples + 1);
      this.calibrationSamples++;
      if (this.calibrationSamples >= 30) {
        // Set threshold above noise floor with margin.
        this.threshold = Math.max(0.02, this.noiseFloor * 4);
        this.noiseCalibrated = true;
      }
      return { isSpeech: false, energy, silenceMs: 0 };
    }

    const isSpeech = energy > this.threshold;
    if (isSpeech) {
      this.silenceAcc = 0;
    } else {
      this.silenceAcc += this.frameMs;
    }
    return {
      isSpeech,
      energy,
      silenceMs: this.silenceAcc,
    };
  }

  /** True when enough silence has elapsed → end of utterance. */
  isUtteranceEnd(): boolean {
    return this.silenceAcc >= this.silenceThresholdMs;
  }

  /** Reset state — call between utterances. */
  reset(): void {
    this.silenceAcc = 0;
  }

  /** Compute RMS of a PCM frame, normalized to [0, 1]. */
  private rms(pcm: Int16Array): number {
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) {
      const v = (pcm[i] ?? 0) / 32768;
      sum += v * v;
    }
    return Math.sqrt(sum / pcm.length);
  }
}
