import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'futuremode2026',
  description: 'Google Meet 風格 + 即時 AI 助手會議系統',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="antialiased">{children}</body>
    </html>
  );
}
