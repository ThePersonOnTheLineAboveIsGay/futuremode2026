'use client';

import { useRouter } from 'next/navigation';

interface Props {
  isMicEnabled: boolean;
  isCamEnabled: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onLeave: () => void;
}

export function ControlBar({ isMicEnabled, isCamEnabled, onToggleMic, onToggleCam, onLeave }: Props) {
  const router = useRouter();

  const handleLeave = async () => {
    await onLeave();
    router.push('/zh-TW');
  };

  return (
    <div className="flex items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
      <button
        onClick={onToggleMic}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          isMicEnabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-red-500 text-white hover:bg-red-600'
        }`}
        title={isMicEnabled ? '關閉麥克風' : '開啟麥克風'}
      >
        {isMicEnabled ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="2" x2="22" y2="22"/>
            <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/>
            <path d="M5 10v2a7 7 0 0 0 12 5"/>
            <path d="M15 9.34V4a3 3 0 0 0-5.68-1.33"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
          </svg>
        )}
      </button>

      <button
        onClick={onToggleCam}
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          isCamEnabled ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-red-500 text-white hover:bg-red-600'
        }`}
        title={isCamEnabled ? '關閉攝影機' : '開啟攝影機'}
      >
        {isCamEnabled ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="23 7 16 12 23 17 23 7"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="2" x2="22" y2="22"/>
            <path d="M10.66 5H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
            <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2l5.66 5.66"/>
          </svg>
        )}
      </button>

      <button
        onClick={handleLeave}
        className="ml-4 flex h-11 items-center gap-2 rounded-full bg-red-600 px-5 text-sm font-medium text-white hover:bg-red-700"
        title="離開會議"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
        </svg>
        離開
      </button>
    </div>
  );
}
