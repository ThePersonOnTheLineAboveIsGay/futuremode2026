'use client';

interface Props {
  text: string | null;
}

/**
 * Full-screen banner shown when AI is speaking.
 * Auto-fades after the intervention ends (parent controls visibility).
 */
export function AIBanner({ text }: Props) {
  if (!text) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-gradient-to-b from-amber-500/15 via-amber-400/10 to-amber-500/15 backdrop-blur-sm transition-opacity duration-300">
      <div className="pointer-events-auto mx-4 max-w-3xl rounded-2xl border-2 border-amber-400 bg-white/95 p-8 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-3 w-3 animate-pulse rounded-full bg-amber-500" />
          <span className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            AI 正在發言
          </span>
        </div>
        <p className="text-2xl font-medium leading-relaxed text-slate-900">{text}</p>
      </div>
    </div>
  );
}
