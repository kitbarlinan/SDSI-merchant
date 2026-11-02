import { NextResponse } from 'next/server';
import { configProblem, database } from '@/lib/server/runtime';
import { dataFor } from '@/lib/server/service';
import { authenticate } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in person's own data. */
export async function GET(request: Request) {
  const problem = configProblem();
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 503 });
  const auth = await authenticate(request);
  if (!auth) return NextResponse.json({ ok: false, error: 'Please sign in.' }, { status: 401 });
  try {
    const reply = await dataFor(database(), auth);
    return NextResponse.json(reply, { status: reply.ok ? 200 : reply.status });
  } catch {
    return NextResponse.json({ ok: false, error: 'The server could not load your data. Try again.' }, { status: 500 });
  }
}
