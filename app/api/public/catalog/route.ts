import { NextResponse } from 'next/server';
import { configProblem, database } from '@/lib/server/runtime';
import { publicCatalog } from '@/lib/server/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** What the public landing page may show: the reseller packages and whether each branch has stock. */
export async function GET() {
  const problem = configProblem();
  if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, data: await publicCatalog(database()) });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not load the packages.' }, { status: 500 });
  }
}
