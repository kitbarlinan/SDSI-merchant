'use client';

import { useState } from 'react';
import { useAppData } from '@/lib/store';

/** "Send invitation again" and "Get invite link" for one person. Admin only, live mode only. The answer shows right under them. */
export function InviteActions({ userId, email }: { userId: string; email?: string }) {
  const { team } = useAppData();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string; link?: string } | null>(null);
  if (!team || !email) return null;

  async function resend() {
    setBusy(true);
    setNote(null);
    const result = await team!.resendInvite(userId);
    setBusy(false);
    if (!result.ok) return setNote({ tone: 'bad', text: result.error });
    if (result.warnings?.length) return setNote({ tone: 'bad', text: `The email was not sent. ${result.warnings.join(' ')}` });
    setNote({ tone: 'ok', text: `Email sent again to ${email}. The link works for a limited time (check Supabase → Email OTP expiration).` });
  }

  async function link() {
    setBusy(true);
    setNote(null);
    const result = await team!.inviteLink(userId);
    setBusy(false);
    if (!result.ok) return setNote({ tone: 'bad', text: result.error });
    try {
      await navigator.clipboard.writeText(result.value);
    } catch {
      /* shown below anyway */
    }
    setNote({ tone: 'ok', text: 'Link made and copied. It works once and expires, so send it right away.', link: result.value });
  }

  return (
    <div className="text-xs">
      <span className="inline-flex gap-3 font-semibold">
        <button type="button" disabled={busy} onClick={() => void resend()} className="text-emerald-700 hover:underline disabled:opacity-60">Send invitation again</button>
        <button type="button" disabled={busy} onClick={() => void link()} className="text-emerald-700 hover:underline disabled:opacity-60">Get invite link</button>
      </span>
      {note ? (
        <div role="status" className={`mt-2 max-w-xs rounded-lg p-2 ${note.tone === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
          <p className="whitespace-pre-line">{note.text}</p>
          {note.link ? <input readOnly value={note.link} onFocus={(event) => event.currentTarget.select()} aria-label="Invite link" className="mt-1 w-full rounded border border-emerald-200 bg-white px-1.5 py-1 font-mono text-[10px]" /> : null}
        </div>
      ) : null}
    </div>
  );
}
