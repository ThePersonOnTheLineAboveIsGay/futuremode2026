/**
 * BotWorker: AI bot lifecycle for one LiveKit room.
 *
 * Connects via @livekit/rtc-node, subscribes to all remote audio tracks,
 * publishes its own audio track for TTS playback, runs the orchestrator.
 */
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteAudioTrack,
  AudioSource,
  LocalAudioTrack,
  AudioStream,
  AudioFrame,
} from '@livekit/rtc-node';
import { AI_BOT_IDENTITY_PREFIX } from '@futuremode/shared/constants';
import type { InterventionDecision, InterventionLog, Utterance, Persona } from '@futuremode/shared';
import { AudioPipeline } from './audioPipeline.js';
import { TtsPublisher } from './ttsPublisher.js';
import { Recorder } from './recorder.js';
import { Orchestrator } from '../orchestrator/stateMachine.js';
import { speak, type SpeakChunk } from '../ai/tts.js';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'ws://localhost:7881';
// Enum values from livekit/rtc-ffi-bindings (no .d.ts exposed for that package)
const TRACK_KIND_AUDIO = 1;

export interface BotWorkerDeps {
  mintToken: (roomName: string, identity: string) => Promise<string>;
}

export class BotWorker {
  private room: Room | null = null;
  private audioSource: AudioSource | null = null;
  private ttsPublisher: TtsPublisher | null = null;
  private recorder: Recorder;
  private orchestrator: Orchestrator;
  private pipelines = new Map<string, AudioPipeline>();
  private speaking = false;

  constructor(
    public readonly roomCode: string,
    private deps: BotWorkerDeps,
  ) {
    this.recorder = new Recorder(roomCode);
    this.orchestrator = new Orchestrator({
      speak: this.speakWithTts.bind(this),
      persistIntervention: (log) => this.recorder.appendIntervention(log),
    });
    this.orchestrator.on('utterance', ((u: Utterance) => {
      void this.recorder.appendUtterance(u);
      this.broadcast({ type: 'utterance', utterance: u });
    }) as never);
    this.orchestrator.on('intervention_start', ((text: string) => {
      this.speaking = true;
      console.log(`[bot:${this.roomCode}] speaking:`, text);
      this.broadcast({ type: 'intervention_start', text });
    }) as never);
    this.orchestrator.on('intervention_end', ((log: InterventionLog) => {
      this.speaking = false;
      this.broadcast({ type: 'intervention_end', log });
    }) as never);
    this.orchestrator.on('decision', ((d: InterventionDecision) => {
      console.log(
        `[bot:${this.roomCode}] decision:`,
        d.intervene ? 'INTERVENE' : 'skip',
        `(${d.kind}, conf=${d.confidence.toFixed(2)})`,
      );
      this.broadcast({ type: 'decision', decision: d });
    }) as never);
  }

  private broadcast(data: unknown): void {
    if (!this.room?.localParticipant) return;
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(data));
      void this.room.localParticipant
        .publishData(bytes, {
          reliable: true,
          topic: 'fm-ai-event',
        })
        .catch(() => undefined);
    } catch (err) {
      console.warn(`[bot:${this.roomCode}] broadcast failed:`, err);
    }
  }

  async start(): Promise<void> {
    const identity = `${AI_BOT_IDENTITY_PREFIX}-${this.roomCode}-${Date.now().toString(36)}`;
    const token = await this.deps.mintToken(this.roomCode, identity);

    const room = new Room();

    room.on(RoomEvent.Connected, () => {
      console.log(`[bot:${this.roomCode}] connected as ${identity}`);
    });
    room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
      console.log(`[bot:${this.roomCode}] participant joined: ${p.identity}`);
      void this.subscribeParticipant(p);
      void this.recorder.upsertParticipant({
        identity: p.identity,
        displayName: p.name || p.identity,
        joinedAt: Date.now(),
      });
    });
    room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
      console.log(`[bot:${this.roomCode}] participant left: ${p.identity}`);
      const pipeline = this.pipelines.get(p.identity);
      if (pipeline) {
        void pipeline.finalize();
        this.pipelines.delete(p.identity);
      }
    });
    room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind === TRACK_KIND_AUDIO) {
        void this.handleAudioTrack(
          participant.identity,
          participant.name || participant.identity,
          track as unknown as RemoteAudioTrack,
        );
      }
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, _pub, participant) => {
      if (track.kind === TRACK_KIND_AUDIO) {
        const pipeline = this.pipelines.get(participant.identity);
        if (pipeline) {
          void pipeline.finalize();
          this.pipelines.delete(participant.identity);
        }
      }
    });

    await room.connect(LIVEKIT_URL, token);
    this.room = room;

    for (const p of room.remoteParticipants.values()) {
      await this.subscribeParticipant(p);
    }

    // Publish AI audio track for TTS playback
    const audioSource = new AudioSource(24000, 1);
    const localTrack = LocalAudioTrack.createAudioTrack('ai-voice', audioSource);
    if (!room.localParticipant) throw new Error('localParticipant not initialized');
    await room.localParticipant.publishTrack(localTrack, {} as unknown as Parameters<typeof room.localParticipant.publishTrack>[1]);
    this.audioSource = audioSource;
    this.ttsPublisher = new TtsPublisher(audioSource);
    console.log(`[bot:${this.roomCode}] AI audio track published`);
  }

  private async subscribeParticipant(p: RemoteParticipant): Promise<void> {
    for (const pub of p.trackPublications.values()) {
      if (pub.kind === TRACK_KIND_AUDIO && pub.track) {
        await this.handleAudioTrack(
          p.identity,
          p.name || p.identity,
          pub.track as unknown as RemoteAudioTrack,
        );
      }
    }
  }

  private async handleAudioTrack(
    identity: string,
    displayName: string,
    track: RemoteAudioTrack,
  ): Promise<void> {
    if (this.pipelines.has(identity)) return;

    console.log(`[bot:${this.roomCode}] subscribing to ${identity}'s audio`);
    const pipeline = new AudioPipeline({
      speakerId: identity,
      speakerName: displayName,
      sampleRate: 48000,
    });
    pipeline.on('utterance', (u: Utterance) => {
      console.log(`[bot:${this.roomCode}] [${displayName}] ${u.text}`);
      void this.orchestrator.pushUtterance(u);
    });
    this.pipelines.set(identity, pipeline);

    // AudioStream wraps the track as a ReadableStream<AudioFrame>
    const stream = new AudioStream(track, 48000, 1);
    void this.consumeAudioStream(pipeline, stream);
  }

  private async consumeAudioStream(
    pipeline: AudioPipeline,
    stream: ReadableStream<AudioFrame>,
  ): Promise<void> {
    try {
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.data) {
          await pipeline.feedFrame(value.data);
        }
      }
    } catch (err) {
      console.error(`[bot:${this.roomCode}] audio stream error:`, err);
    }
  }

  private async* speakWithTts(text: string): AsyncGenerator<SpeakChunk> {
    if (!this.ttsPublisher) {
      throw new Error('TTS publisher not initialized');
    }
    const publisher = this.ttsPublisher;
    for await (const chunk of speak({ text })) {
      if (!this.speaking) break;
      publisher.pushFrame(chunk.pcm, chunk.sampleRate);
      yield chunk;
    }
  }

  async stop(): Promise<void> {
    for (const pipeline of this.pipelines.values()) {
      await pipeline.finalize();
    }
    this.pipelines.clear();
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    console.log(`[bot:${this.roomCode}] stopped`);
  }

  setPersona(p: Persona['id']) {
    this.orchestrator.setPersona(p);
  }
}
