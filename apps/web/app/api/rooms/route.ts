import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js API proxy for room creation.
 * Calls the Fastify API and returns the result.
 */
export async function POST(request: NextRequest) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiUrl}/api/v1/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'upstream_unreachable', message: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}
