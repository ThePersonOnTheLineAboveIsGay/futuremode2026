/**
 * Recording store: persists meeting transcripts and AI interventions to JSON.
 *
 * File format: apps/api/data/recordings/<roomCode>.json
 * - Updated periodically (every 5s) to avoid losing data on crash
 * - Loaded on demand when recap page requests it
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { InterventionLog, Participant, Utterance } from '@futuremode/shared';
import { env } from '../plugins/env.js';

export interface Recording {
  code: string;
  createdAt: number;
  endedAt?: number;
  participants: Participant[];
  utterances: Utterance[];
  interventions: InterventionLog[];
}

const recordingsDir = resolve(process.cwd(), env.RECORDINGS_DIR);

async function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

function recordingPath(code: string): string {
  return join(recordingsDir, `${code}.json`);
}

const cache = new Map<string, Recording>();

export async function getRecording(code: string): Promise<Recording | null> {
  if (cache.has(code)) return cache.get(code)!;
  const path = recordingPath(code);
  try {
    await stat(path);
  } catch {
    return null;
  }
  const raw = await readFile(path, 'utf-8');
  const data = JSON.parse(raw) as Recording;
  cache.set(code, data);
  return data;
}

export async function ensureRecording(code: string): Promise<Recording> {
  const existing = await getRecording(code);
  if (existing) return existing;
  const fresh: Recording = {
    code,
    createdAt: Date.now(),
    participants: [],
    utterances: [],
    interventions: [],
  };
  await writeRecording(fresh);
  cache.set(code, fresh);
  return fresh;
}

export async function appendUtterance(code: string, u: Utterance): Promise<void> {
  const rec = await ensureRecording(code);
  rec.utterances.push(u);
  await scheduleWrite(rec);
}

export async function appendIntervention(code: string, i: InterventionLog): Promise<void> {
  const rec = await ensureRecording(code);
  rec.interventions.push(i);
  await scheduleWrite(rec);
}

export async function upsertParticipant(code: string, p: Participant): Promise<void> {
  const rec = await ensureRecording(code);
  const existing = rec.participants.findIndex((x) => x.identity === p.identity);
  if (existing >= 0) rec.participants[existing] = p;
  else rec.participants.push(p);
  await scheduleWrite(rec);
}

export async function endRecording(code: string): Promise<void> {
  const rec = await getRecording(code);
  if (!rec) return;
  rec.endedAt = Date.now();
  await writeRecording(rec);
  cache.delete(code);
}

// Debounced writes: many appends in quick succession = one write
const pendingWrites = new Map<string, NodeJS.Timeout>();

async function scheduleWrite(rec: Recording): Promise<void> {
  const code = rec.code;
  const existing = pendingWrites.get(code);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    code,
    setTimeout(() => {
      pendingWrites.delete(code);
      writeRecording(rec).catch((err) => console.error('[recording] write failed:', err));
    }, 1000),
  );
}

async function writeRecording(rec: Recording): Promise<void> {
  const path = recordingPath(rec.code);
  await ensureDir(path);
  await writeFile(path, JSON.stringify(rec, null, 2), 'utf-8');
}
