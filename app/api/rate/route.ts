import { NextResponse } from 'next/server';
import { IS_LIVE } from '@/lib/mode';
import { database } from '@/lib/server/runtime';
import { dataFor } from '@/lib/server/service';
import { authenticate } from '@/lib/server/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The rate from the admin's Google Sheet (a cell with =GOOGLEFINANCE("CURRENCY:HKDPHP"), published as CSV).
 * Admin only. It only reads the number: the admin still decides to apply it. Set RATE_SHEET_URL in Vercel to change the sheet.
 */
const DEFAULT_SHEET =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRj5meKI_XwxG34B3lB_nxBaUZupoN102UKKbQLmML7-Swnfx51mBYkWyjqFy3wk7LGkzVvYjpphdwC/pub?gid=0&single=true&output=csv';

export async function GET(request: Request) {
  if (IS_LIVE) {
    const auth = await authenticate(request);
    const reply = auth ? await dataFor(database(), auth) : null;
    if (!reply || !reply.ok || reply.me?.role !== 'admin') return NextResponse.json({ ok: false, error: 'Only the admin can do this.' }, { status: 403 });
  }
  try {
    const response = await fetch(process.env.RATE_SHEET_URL || DEFAULT_SHEET, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) return NextResponse.json({ ok: false, error: `The sheet could not be read (${response.status}). Check that it is published to the web as CSV.` }, { status: 502 });
    const text = await response.text();
    // First cell that is a plain positive number.
    const cells = text.split(/[\r\n,;]+/).map((cell) => cell.replace(/["\s]/g, ''));
    const rate = cells.map((cell) => (/^\d+(\.\d+)?$/.test(cell) ? Number(cell) : NaN)).find((value) => value > 0);
    if (rate === undefined || !(rate > 0.5 && rate < 1000)) return NextResponse.json({ ok: false, error: 'No exchange rate was found in the sheet. The first cell should hold the number.' }, { status: 502 });
    return NextResponse.json({ ok: true, rate: Math.round(rate * 10000) / 10000, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, error: 'The sheet could not be reached. Try again in a moment.' }, { status: 502 });
  }
}
