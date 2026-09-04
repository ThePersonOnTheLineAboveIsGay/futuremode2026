import Link from 'next/link';

interface PageProps {
  params: { lang: string; code: string };
}

interface Recording {
  code: string;
  createdAt: number;
  endedAt?: number;
  participants: Array<{ identity: string; displayName: string; joinedAt: number }>;
  utterances: Array<{ id: string; ts: number; speakerName: string; text: string }>;
  interventions: Array<{
    id: string;
    ts: number;
    personaId: string;
    kind: string;
    text: string;
    confidence: number;
    triggeredByUtteranceId?: string;
    latencyMs?: { stt: number; llm: number; tts: number; total: number };
  }>;
}

async function fetchRecording(code: string): Promise<Recording | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/v1/recordings/${code}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as Recording;
  } catch {
    return null;
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export default async function RecapPage({ params }: PageProps) {
  const recording = await fetchRecording(params.code);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link
            href={`/${params.lang}/room/${params.code}`}
            className="text-sm text-brand-600 hover:underline"
          >
            ← 返回會議室
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">會議總覽</h1>
          <p className="mt-1 text-sm text-slate-500">
            房間代碼 <span className="font-mono">{params.code}</span>
            {recording && (
              <>
                {' · '}開始於 {new Date(recording.createdAt).toLocaleString('zh-TW')}
                {recording.endedAt && (
                  <> · 結束於 {new Date(recording.endedAt).toLocaleString('zh-TW')}</>
                )}
              </>
            )}
          </p>
        </div>
      </header>

      {!recording && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800">
          找不到此會議的錄製資料。可能會議尚未結束，或從未開始過。
        </div>
      )}

      {recording && (
        <div className="space-y-8">
          {/* Stats */}
          <section className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-500">參與者</div>
              <div className="mt-1 text-2xl font-semibold">{recording.participants.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-500">逐字稿數</div>
              <div className="mt-1 text-2xl font-semibold">{recording.utterances.length}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-500">AI 介入</div>
              <div className="mt-1 text-2xl font-semibold">{recording.interventions.length}</div>
            </div>
          </section>

          {/* Interventions */}
          {recording.interventions.length > 0 && (
            <section>
              <h2 className="mb-4 text-xl font-semibold text-slate-900">AI 介入時間軸</h2>
              <div className="space-y-3">
                {recording.interventions.map((it) => (
                  <div
                    key={it.id}
                    className="rounded-lg border border-amber-200 bg-amber-50/50 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                          {it.personaId}
                        </span>
                        <span className="text-xs text-slate-500">
                          {it.kind} · 信心度 {(it.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <span className="text-xs text-slate-500">{formatTime(it.ts)}</span>
                    </div>
                    <p className="text-slate-800">{it.text}</p>
                    {it.latencyMs && (
                      <div className="mt-2 text-xs text-slate-500">
                        延遲：STT {formatDuration(it.latencyMs.stt)} · LLM{' '}
                        {formatDuration(it.latencyMs.llm)} · TTS {formatDuration(it.latencyMs.tts)} · 總計{' '}
                        {formatDuration(it.latencyMs.total)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Transcript */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-slate-900">逐字稿</h2>
            <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
              {recording.utterances.map((u) => (
                <div key={u.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">{u.speakerName}</span>
                    <span className="text-xs text-slate-400">{formatTime(u.ts)}</span>
                  </div>
                  <p className="text-slate-600">{u.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
