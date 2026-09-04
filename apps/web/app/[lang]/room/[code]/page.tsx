'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConnectionState } from 'livekit-client';
import { useLiveKitRoom } from '@/hooks/useLiveKitRoom';
import { useAIStream } from '@/hooks/useAIStream';
import { ParticipantGrid } from '@/components/meeting/ParticipantGrid';
import { ControlBar } from '@/components/meeting/ControlBar';
import { TranscriptPanel } from '@/components/transcript/TranscriptPanel';
import { AIBanner } from '@/components/meeting/AIBanner';
import { PersonaSelector } from '@/components/meeting/PersonaSelector';
import { DEFAULT_PERSONAS } from '@futuremode/shared/constants';
import type { PersonaId } from '@futuremode/shared';

function RoomPageInner({ code }: { code: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const token = searchParams.get('token');
  const identity = searchParams.get('identity');
  const legacyUrl = searchParams.get('url');
  const [livekitUrl, setLivekitUrl] = useState<string | null>(
    process.env.NEXT_PUBLIC_LIVEKIT_URL ?? legacyUrl,
  );

  useEffect(() => {
    if (!livekitUrl) {
      let cancelled = false;
      fetch('/api/config')
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled && d.livekitUrl) setLivekitUrl(d.livekitUrl);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
  }, [livekitUrl]);

  useEffect(() => {
    if (!token || !livekitUrl || !identity) {
      router.replace('/zh-TW');
    }
  }, [token, livekitUrl, identity, router]);

  const {
    room,
    connectionState,
    participants,
    error,
    toggleMicrophone,
    toggleCamera,
    leave,
  } = useLiveKitRoom({
    token: token ?? '',
    url: livekitUrl ?? '',
    audio: true,
    video: true,
  });

  const [persona, setPersona] = useState<PersonaId>('critic');
  const { utterances, currentIntervention } = useAIStream(room);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  if (!token || !livekitUrl || !identity) return null;
  const local = participants.find((p) => p.isLocal);

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">futuremode2026</h1>
          <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">{code}</span>
        </div>
        <div className="flex items-center gap-3">
          <PersonaSelector value={persona} onChange={setPersona} />
          <button
            onClick={() => setTranscriptOpen((o) => !o)}
            className="rounded bg-slate-800 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
          >
            {transcriptOpen ? '隱藏' : '顯示'}逐字稿 ({utterances.length})
          </button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {connectionState === ConnectionState.Connecting && (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                連線中...
              </>
            )}
            {connectionState === ConnectionState.Connected && (
              <>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                已連線 · {participants.length} 人
              </>
            )}
            {error && <span className="text-red-400">{error}</span>}
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 overflow-hidden">
        <div className={`flex-1 p-4 ${transcriptOpen ? 'pr-0' : ''}`}>
          <ParticipantGrid participants={participants} />
        </div>
        {transcriptOpen && (
          <aside className="w-80 border-l border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
              即時逐字稿
            </div>
            <div className="h-[calc(100%-2.5rem)]">
              <TranscriptPanel utterances={utterances} />
            </div>
          </aside>
        )}
      </main>

      <ControlBar
        isMicEnabled={local?.isMicrophoneEnabled ?? false}
        isCamEnabled={local?.isCameraEnabled ?? false}
        onToggleMic={toggleMicrophone}
        onToggleCam={toggleCamera}
        onLeave={leave}
      />

      <AIBanner text={currentIntervention?.text ?? null} />
    </div>
  );
}

export default function RoomPage({ params }: { params: { code: string } }) {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        載入中...
      </div>
    }>
      <RoomPageInner code={params.code} />
    </Suspense>
  );
}
