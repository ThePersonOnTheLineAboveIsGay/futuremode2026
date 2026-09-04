'use client';

import { useEffect, useState } from 'react';
import type { Room } from 'livekit-client';
import type {
  InterventionDecision,
  InterventionLog,
  Utterance,
} from '@futuremode/shared';

export interface AIStreamState {
  utterances: Utterance[];
  currentIntervention: { text: string; log: InterventionLog } | null;
  recentDecisions: Array<{ decision: InterventionDecision; ts: number }>;
}

/**
 * Subscribe to AI events broadcast via LiveKit DataChannel.
 *
 * Events arrive as JSON-encoded payloads. The bot publishes them
 * with topic `fm-ai-event` and payload type byte 0x01 (string).
 */
export function useAIStream(room: Room | null): AIStreamState {
  const [utterances, setUtterances] = useState<Utterance[]>([]);
  const [currentIntervention, setCurrentIntervention] = useState<{
    text: string;
    log: InterventionLog;
  } | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<
    Array<{ decision: InterventionDecision; ts: number }>
  >([]);

  useEffect(() => {
    if (!room) return;

    const handler = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      _topic?: string,
    ) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        switch (data.type) {
          case 'utterance':
            setUtterances((prev) => [...prev, data.utterance as Utterance].slice(-200));
            break;
          case 'intervention_start':
            setCurrentIntervention({ text: data.text as string, log: null as unknown as InterventionLog });
            break;
          case 'intervention_end':
            setCurrentIntervention((prev) =>
              prev ? { text: prev.text, log: data.log as InterventionLog } : null,
            );
            // Auto-clear banner after 5s
            setTimeout(() => setCurrentIntervention(null), 5000);
            break;
          case 'decision':
            setRecentDecisions((prev) =>
              [...prev, { decision: data.decision as InterventionDecision, ts: Date.now() }].slice(-20),
            );
            break;
        }
      } catch (err) {
        console.warn('[useAIStream] failed to parse payload:', err);
      }
    };

    // Listen on the room's data received event
    room.on('dataReceived', handler);
    return () => {
      room.off('dataReceived', handler);
    };
  }, [room]);

  return { utterances, currentIntervention, recentDecisions };
}
