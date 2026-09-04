import { NextResponse } from 'next/server';

/**
 * Next.js API proxy for fetching client-facing config (LiveKit URL).
 * Single source of truth = the Fastify API server's env.
 */
export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  try {
    const res = await fetch(`${apiUrl}/api/v1/config`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'upstream_unreachable', message: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}
