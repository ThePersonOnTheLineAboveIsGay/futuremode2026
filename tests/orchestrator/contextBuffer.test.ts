import { describe, expect, it } from 'vitest';
import { ContextBuffer } from '../../services/ai-bot/src/orchestrator/contextBuffer.js';

function u(speakerId: string, speakerName: string, text: string, ts = Date.now()): import('@futuremode/shared').Utterance {
  return {
    id: `u_${ts}_${Math.random().toString(36).slice(2, 8)}`,
    ts,
    speakerId,
    speakerName,
    text,
  };
}

describe('ContextBuffer', () => {
  it('keeps utterances per speaker', () => {
    const buf = new ContextBuffer();
    buf.add(u('a', 'Alice', 'hello'));
    buf.add(u('b', 'Bob', 'hi'));
    buf.add(u('a', 'Alice', 'how are you'));
    expect(buf.forSpeaker('a')).toHaveLength(2);
    expect(buf.forSpeaker('b')).toHaveLength(1);
    expect(buf.all()).toHaveLength(3);
  });

  it('caps per-speaker buffer at MAX_PER_SPEAKER (10)', () => {
    const buf = new ContextBuffer();
    for (let i = 0; i < 15; i++) {
      buf.add(u('a', 'Alice', `m${i}`));
    }
    expect(buf.forSpeaker('a')).toHaveLength(10);
  });

  it('caps global buffer at MAX_GLOBAL (50)', () => {
    const buf = new ContextBuffer();
    for (let i = 0; i < 60; i++) {
      buf.add(u(`s${i}`, 'Speaker', `m${i}`));
    }
    expect(buf.all()).toHaveLength(50);
  });

  it('clear() empties all', () => {
    const buf = new ContextBuffer();
    buf.add(u('a', 'Alice', 'hello'));
    buf.add(u('b', 'Bob', 'hi'));
    buf.clear();
    expect(buf.all()).toHaveLength(0);
  });

  it('preserves order (oldest first)', () => {
    const buf = new ContextBuffer();
    buf.add(u('a', 'Alice', 'first', 1000));
    buf.add(u('a', 'Alice', 'second', 2000));
    buf.add(u('a', 'Alice', 'third', 3000));
    const list = buf.forSpeaker('a');
    expect(list.map((x) => x.text)).toEqual(['first', 'second', 'third']);
  });
});
