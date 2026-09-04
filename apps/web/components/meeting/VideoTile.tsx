'use client';

import { useEffect, useRef } from 'react';
import type { RemoteAudioTrack, RemoteVideoTrack } from 'livekit-client';
import type { ParticipantTracks } from '@/hooks/useLiveKitRoom';

interface Props {
  participant: ParticipantTracks;
  isLarge?: boolean;
}

/**
 * A single video tile. Renders the participant's video track,
 * with their name overlay and audio-only fallback.
 */
export function VideoTile({ participant, isLarge = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (videoEl && participant.videoTrack) {
      const track = participant.videoTrack as RemoteVideoTrack | MediaStreamTrack;
      if (track instanceof MediaStreamTrack) {
        const stream = new MediaStream([track]);
        videoEl.srcObject = stream;
      } else {
        track.attach(videoEl);
      }
    } else if (videoEl) {
      videoEl.srcObject = null;
    }
    return () => {
      if (videoEl) videoEl.srcObject = null;
    };
  }, [participant.videoTrack]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (audioEl && participant.audioTrack && !participant.isLocal) {
      const track = participant.audioTrack as RemoteAudioTrack | MediaStreamTrack;
      if (track instanceof MediaStreamTrack) {
        const stream = new MediaStream([track]);
        audioEl.srcObject = stream;
      } else {
        track.attach(audioEl);
      }
    } else if (audioEl) {
      audioEl.srcObject = null;
    }
    return () => {
      if (audioEl) audioEl.srcObject = null;
    };
  }, [participant.audioTrack, participant.isLocal]);

  const showVideo = Boolean(participant.videoTrack) && participant.isCameraEnabled;
  const initials = (participant.name || participant.identity).slice(0, 2).toUpperCase();

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-slate-900 ${
        isLarge ? 'aspect-video' : 'aspect-video'
      } ring-2 ${participant.isSpeaking ? 'ring-emerald-400' : 'ring-transparent'} transition-all`}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700 text-2xl font-semibold text-slate-200">
            {initials}
          </div>
        </div>
      )}

      {/* Hidden audio element for remote participants */}
      {!participant.isLocal && participant.audioTrack && (
        <audio ref={audioRef} autoPlay />
      )}

      {/* Name overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">
            {participant.name || participant.identity}
            {participant.isLocal && <span className="ml-1 text-xs text-slate-300">（你）</span>}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {!participant.isMicrophoneEnabled && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white" title="麥克風關閉">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V4a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="15" y1="9" x2="15" y2="9"/></svg>
              </span>
            )}
            {!participant.isCameraEnabled && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white" title="攝影機關閉">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="22" y2="22"/><path d="M10.66 5H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2l5.66 5.66"/></svg>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
