/**
 * useLiveKitRoom — encapsulates the LiveKit Room lifecycle for one meeting.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type RemoteParticipant,
  type LocalParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  type Participant,
} from 'livekit-client';

export interface ParticipantTracks {
  identity: string;
  name: string;
  isLocal: boolean;
  audioTrack?: MediaStreamTrack;
  videoTrack?: MediaStreamTrack;
  isSpeaking: boolean;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
}

interface UseLiveKitRoomOptions {
  token: string;
  url: string;
  audio?: boolean;
  video?: boolean;
}

export interface UseLiveKitRoomReturn {
  room: Room | null;
  connectionState: ConnectionState;
  participants: ParticipantTracks[];
  localIdentity: string | null;
  error: string | null;
  toggleMicrophone: () => Promise<void>;
  toggleCamera: () => Promise<void>;
  leave: () => Promise<void>;
}

/**
 * Extract a MediaStreamTrack from a LiveKit RemoteTrack for attaching to a <video>/<audio> element.
 * Falls back to a captured stream if the LiveKit API doesn't expose a MediaStreamTrack directly.
 */
function extractMediaStreamTrack(track: RemoteAudioTrack | RemoteVideoTrack): MediaStreamTrack {
  // LiveKit's RemoteTrack has a `mediaStreamTrack` accessor that returns the underlying
  // MediaStreamTrack. This works for both audio and video tracks.
  const mst = (track as unknown as { mediaStreamTrack?: MediaStreamTrack }).mediaStreamTrack;
  if (mst) return mst;
  // Fallback: capture from a temporary stream (less efficient but works).
  const stream = new MediaStream();
  // Use attach/detach to bridge.
  const tempVideo = document.createElement('video');
  track.attach(tempVideo);
  if (tempVideo.srcObject instanceof MediaStream) {
    const first = tempVideo.srcObject.getTracks()[0];
    track.detach(tempVideo);
    if (first) return first;
  }
  track.detach(tempVideo);
  throw new Error('Unable to extract MediaStreamTrack from LiveKit RemoteTrack');
}

export function useLiveKitRoom(opts: UseLiveKitRoomOptions): UseLiveKitRoomReturn {
  const { token, url, audio = true, video = true } = opts;

  const roomRef = useRef<Room | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<Map<string, ParticipantTracks>>(new Map());
  const [localIdentity, setLocalIdentity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateParticipant = useCallback((identity: string, patch: Partial<ParticipantTracks>) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      const existing = next.get(identity);
      next.set(identity, {
        identity,
        name: existing?.name ?? identity,
        isLocal: existing?.isLocal ?? false,
        audioTrack: existing?.audioTrack,
        videoTrack: existing?.videoTrack,
        isSpeaking: existing?.isSpeaking ?? false,
        isMicrophoneEnabled: existing?.isMicrophoneEnabled ?? false,
        isCameraEnabled: existing?.isCameraEnabled ?? false,
        ...patch,
      });
      return next;
    });
  }, []);

  const removeParticipant = useCallback((identity: string) => {
    setParticipants((prev) => {
      const next = new Map(prev);
      next.delete(identity);
      return next;
    });
  }, []);

  // Connect once on mount.
  useEffect(() => {
    let cancelled = false;
    const r = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
      },
    });
    roomRef.current = r;

    const onConnected = () => {
      if (cancelled) return;
      setConnectionState(ConnectionState.Connected);
      setRoom(r);
      setLocalIdentity(r.localParticipant.identity);
      const local: LocalParticipant = r.localParticipant;
      updateParticipant(local.identity, {
        identity: local.identity,
        name: local.name || local.identity,
        isLocal: true,
        isMicrophoneEnabled: local.isMicrophoneEnabled,
        isCameraEnabled: local.isCameraEnabled,
      });
    };

    const onDisconnected = () => {
      if (cancelled) return;
      setConnectionState(ConnectionState.Disconnected);
    };

    const onStateChanged = (state: ConnectionState) => {
      if (cancelled) return;
      setConnectionState(state);
    };

    const onParticipantConnected = (p: RemoteParticipant) => {
      updateParticipant(p.identity, {
        identity: p.identity,
        name: p.name || p.identity,
        isLocal: false,
      });
      // Subscribe to existing tracks.
      p.trackPublications.forEach((pub) => {
        const track = pub.track;
        if (track) {
          handleTrackSubscribed(track, pub, p);
        }
      });
    };

    const handleTrackSubscribed = (
      track: RemoteTrack | undefined,
      pub: RemoteTrackPublication,
      p: RemoteParticipant,
    ) => {
      if (!track) return;
      if (pub.kind === Track.Kind.Audio) {
        const audioTrack = track as RemoteAudioTrack;
        try {
          const mst = extractMediaStreamTrack(audioTrack);
          updateParticipant(p.identity, { audioTrack: mst, isMicrophoneEnabled: !pub.isMuted });
        } catch {
          updateParticipant(p.identity, { isMicrophoneEnabled: !pub.isMuted });
        }
      } else if (pub.kind === Track.Kind.Video) {
        const videoTrack = track as RemoteVideoTrack;
        try {
          const mst = extractMediaStreamTrack(videoTrack);
          updateParticipant(p.identity, { videoTrack: mst, isCameraEnabled: !pub.isMuted });
        } catch {
          updateParticipant(p.identity, { isCameraEnabled: !pub.isMuted });
        }
      }
    };

    const handleTrackUnsubscribed = (
      _track: RemoteTrack | undefined,
      pub: RemoteTrackPublication,
      p: RemoteParticipant,
    ) => {
      if (pub.kind === Track.Kind.Audio) {
        updateParticipant(p.identity, { audioTrack: undefined });
      } else if (pub.kind === Track.Kind.Video) {
        updateParticipant(p.identity, { videoTrack: undefined });
      }
    };

    const onActiveSpeakersChanged = (speakers: Participant[]) => {
      const speakerIds = new Set(speakers.map((s) => s.identity));
      setParticipants((prev) => {
        const next = new Map(prev);
        next.forEach((value, key) => {
          next.set(key, { ...value, isSpeaking: speakerIds.has(key) });
        });
        return next;
      });
    };

    const onLocalTrackPublished = (pub: LocalTrackPublication, p: LocalParticipant) => {
      if (pub.kind === Track.Kind.Audio) {
        updateParticipant(p.identity, { isMicrophoneEnabled: !pub.isMuted });
      } else if (pub.kind === Track.Kind.Video) {
        updateParticipant(p.identity, { isCameraEnabled: !pub.isMuted });
      }
    };

    r.on(RoomEvent.Connected, onConnected);
    r.on(RoomEvent.Disconnected, onDisconnected);
    r.on(RoomEvent.ConnectionStateChanged, onStateChanged);
    r.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    r.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => removeParticipant(p.identity));
    r.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    r.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    r.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakersChanged);
    r.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished);

    r.connect(url, token)
      .then(async () => {
        await r.localParticipant.setMicrophoneEnabled(audio);
        await r.localParticipant.setCameraEnabled(video);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'connection failed');
      });

    return () => {
      cancelled = true;
      r.disconnect();
      roomRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, url]);

  const toggleMicrophone = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const enabled = r.localParticipant.isMicrophoneEnabled;
    await r.localParticipant.setMicrophoneEnabled(!enabled);
    updateParticipant(r.localParticipant.identity, { isMicrophoneEnabled: !enabled });
  }, [updateParticipant]);

  const toggleCamera = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    const enabled = r.localParticipant.isCameraEnabled;
    await r.localParticipant.setCameraEnabled(!enabled);
    updateParticipant(r.localParticipant.identity, { isCameraEnabled: !enabled });
  }, [updateParticipant]);

  const leave = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    await r.disconnect();
  }, []);

  return {
    room,
    connectionState,
    participants: Array.from(participants.values()),
    localIdentity,
    error,
    toggleMicrophone,
    toggleCamera,
    leave,
  };
}
