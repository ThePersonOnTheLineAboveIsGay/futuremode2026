/**
 * TTS publisher: pushes TTS PCM chunks into a LiveKit AudioSource.
 */
import { AudioSource, AudioFrame } from '@livekit/rtc-node';

export class TtsPublisher {
  constructor(private source: AudioSource) {}

  /**
   * Push one PCM frame (Int16 LE, mono) into the AudioSource.
   * Each call should represent ~10-20ms of audio.
   */
  pushFrame(pcm: Int16Array, sampleRate: number): void {
    const numSamples = pcm.length;
    const frame = new AudioFrame(pcm, sampleRate, 1, numSamples);
    this.source.captureFrame(frame);
  }
}
