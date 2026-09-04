'use client';

import { VideoTile } from './VideoTile';
import type { ParticipantTracks } from '@/hooks/useLiveKitRoom';

interface Props {
  participants: ParticipantTracks[];
}

/**
 * Responsive grid of participant video tiles.
 * - 1 participant: full size
 * - 2-4: 2x2
 * - 5-9: 3x3
 * - 10+: scrollable
 */
export function ParticipantGrid({ participants }: Props) {
  const count = participants.length;

  if (count === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-slate-400">等待與會者加入...</div>
      </div>
    );
  }

  const gridCols = count === 1 ? 'grid-cols-1' : count <= 4 ? 'grid-cols-2' : 'grid-cols-3';
  const largeLayout = count <= 2 ? 'max-w-5xl mx-auto' : '';

  return (
    <div className={`grid h-full gap-3 ${gridCols} ${largeLayout}`}>
      {participants.map((p) => (
        <VideoTile key={p.identity} participant={p} />
      ))}
    </div>
  );
}
