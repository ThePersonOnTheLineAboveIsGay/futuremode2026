'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = async () => {
    if (!displayName.trim()) {
      setError('請輸入你的名稱');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Persist identity+displayName for reconnection / recap.
      sessionStorage.setItem(`fm:${data.code}:identity`, data.identity);
      sessionStorage.setItem(`fm:${data.code}:displayName`, displayName.trim());
      router.push(`/zh-TW/room/${data.code}?token=${encodeURIComponent(data.token)}&identity=${encodeURIComponent(data.identity)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '建立會議失敗');
    } finally {
      setSubmitting(false);
    }
  };

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!displayName.trim()) {
      setError('請輸入你的名稱');
      return;
    }
    if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) {
      setError('會議代碼格式錯誤（6 字元）');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      sessionStorage.setItem(`fm:${data.code}:identity`, data.identity);
      sessionStorage.setItem(`fm:${data.code}:displayName`, displayName.trim());
      router.push(`/zh-TW/room/${data.code}?token=${encodeURIComponent(data.token)}&identity=${encodeURIComponent(data.identity)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加入會議失敗');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">
            futuremode2026
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            即時 AI 助手的會議系統
          </p>
        </div>

        <div className="mt-8 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-slate-700">
              你的名稱
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：小明"
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              maxLength={64}
              disabled={submitting}
            />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <button
              onClick={createRoom}
              disabled={submitting}
              className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? '建立中...' : '建立新會議'}
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-500">或</span>
            </div>
          </div>

          <div className="space-y-3">
            <label htmlFor="joinCode" className="block text-sm font-medium text-slate-700">
              會議代碼
            </label>
            <input
              id="joinCode"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="例如：ABC234"
              className="block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm uppercase tracking-wider focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              maxLength={6}
              disabled={submitting}
            />
            <button
              onClick={joinRoom}
              disabled={submitting}
              className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              加入會議
            </button>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          MVP 上限 10 人 · 無需註冊
        </p>
      </div>
    </main>
  );
}
