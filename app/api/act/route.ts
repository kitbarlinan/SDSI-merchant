import { NextResponse } from 'next/server';
import { configProblem, database, deps, tooMany } from '@/lib/server/runtime';
import { explainFailure } from '@/lib/server/diagnose';
import { act } from '@/lib/server/service';
import { authenticate } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Every change. The server decides who is acting from the sign-in token, never from the body. */
export async function POST(request: Request) {
  const problem = configProblem();
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 503 });
  let body: { action?: unknown; args?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }
  if (typeof body.action !== 'string' || (body.args !== undefined && (typeof body.args !== 'object' || body.args === null))) {
    return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 });
  }
  const auth = await authenticate(request);
  if (!auth) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (tooMany(`public:${ip}`)) return NextResponse.json({ ok: false, error: 'Too many tries. Please wait a while.' }, { status: 429 });
  }
  try {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
    const reply = await act(database(), deps, auth, body.action, (body.args ?? {}) as Record<string, unknown>, origin);
    return NextResponse.json(reply, { status: reply.ok ? 200 : reply.status });
  } catch (error) {
    console.error('action failed', error);
    return NextResponse.json({ ok: false, error: `${explainFailure(error)} Nothing was changed.` }, { status: 500 });
  }
}
