import { NextResponse } from 'next/server';
import { configProblem, database } from '@/lib/server/runtime';
import { explainFailure } from '@/lib/server/diagnose';
import { dataFor } from '@/lib/server/service';
import { authConfigMissing, authenticate } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The signed-in person's own data. */
export async function GET(request: Request) {
  const problem = configProblem();
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 503 });
  const auth = await authenticate(request);
  if (!auth) {
    const why = authConfigMissing() ?? 'The server could not verify your sign-in. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel (they must be from the same Supabase project), then redeploy.';
    return NextResponse.json({ ok: false, error: why }, { status: 401 });
  }
  try {
    const reply = await dataFor(database(), auth, new URL(request.url).searchParams.get('viewAs') ?? undefined);
    return NextResponse.json(reply, { status: reply.ok ? 200 : reply.status });
  } catch (error) {
    console.error('state failed', error);
    return NextResponse.json({ ok: false, error: explainFailure(error) }, { status: 500 });
  }
}
