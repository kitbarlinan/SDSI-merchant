import { NextResponse } from 'next/server';
import { productionDb } from '@/lib/server/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Setup check you can open in the browser. Shows what the server can see WITHOUT revealing any secret:
 * only yes/no for each variable, the kind of database address, and the database's error code.
 */
export async function GET() {
  const raw = process.env.DATABASE_URL ?? '';
  let shape: Record<string, unknown> = { set: raw.length > 0 };
  if (raw) {
    try {
      const url = new URL(raw);
      const host = url.hostname;
      shape = {
        set: true,
        protocol: url.protocol,
        kind: host.includes('pooler.supabase.com') ? 'pooler (good)' : /^db\..+\.supabase\.co$/.test(host) ? 'DIRECT (wrong: use the Transaction pooler)' : 'other',
        port: url.port || '(default)',
        userLooksLikePoolerUser: url.username.startsWith('postgres.'),
        passwordSet: url.password.length > 0,
        passwordHasBrackets: /[[\]]/.test(decodeURIComponent(url.password)),
        hasWhitespace: /\s/.test(raw),
      };
    } catch {
      shape = { set: true, valid: false, hint: 'DATABASE_URL is not a valid address. Symbols in the password (@ # / :) break it.', hasWhitespace: /\s/.test(raw), startsWith: raw.slice(0, 11) };
    }
  }
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_DATA_MODE: process.env.NEXT_PUBLIC_DATA_MODE ?? '(not set)',
  };
  let db: Record<string, unknown> = { skipped: 'DATABASE_URL is not set' };
  if (raw) {
    try {
      const result = await productionDb().query<{ n: string }>(
        "select count(*)::text as n from information_schema.tables where table_schema = 'public' and table_name = 'app_records'",
      );
      db = { connected: true, app_records_table: result.rows[0]?.n === '1' ? 'exists' : 'MISSING: run 0007_app_records.sql' };
    } catch (error) {
      const e = error as { code?: string; message?: string };
      db = { connected: false, code: e.code ?? null, reason: (e.message ?? '').replace(/postgres(ql)?:\/\/\S+/g, '[address hidden]').slice(0, 160) };
    }
  }
  return NextResponse.json({ env, DATABASE_URL: shape, db }, { headers: { 'cache-control': 'no-store' } });
}
