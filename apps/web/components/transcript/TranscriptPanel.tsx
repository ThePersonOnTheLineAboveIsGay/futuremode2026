'use client';

import { useEffect, useRef } from 'react';
import type { Utterance } from '@futuremode/shared';

interface Props {
  utterances: Utterance[];
}

/**
 * Live transcript panel. Auto-scrolls to bottom on new utterance.
 */
export function TranscriptPanel({ utterances }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [utterances.length]);

  if (utterances.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-400">
        等待第一位講者發言...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto px-3 py-3">
      {utterances.map((u) => (
        <div key={u.id} className="flex flex-col gap-0.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">{u.speakerName}</span>
            <span className="text-xs text-slate-400">
              {new Date(u.ts).toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
          <p className="text-slate-600">{u.text}</p>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
