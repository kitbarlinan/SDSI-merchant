'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

/** Live sign-in: email and password. Accounts are created by invitation, so there is no sign-up. */
export function RemoteSignIn() {
  const { signIn, sendReset } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setNotice(null);
    setError(await signIn(email, password));
    setBusy(false);
  }

  async function forgot() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Type your email above first, then click "Forgot password".');
    setBusy(true);
    const problem = await sendReset(email);
    setBusy(false);
    if (problem) return setError(problem);
    setError(null);
    setNotice('If that email has an account, a link to choose a new password is on its way.');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 text-emerald-950 shadow">
            <Icon name="cart" className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">{BRAND.name}</p>
            <p className="text-sm text-emerald-200/80">{BRAND.tagline}</p>
          </div>
        </div>
        <form
          className="space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <Field label="Email" htmlFor="liveEmail">
            <input id="liveEmail" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass(false)} />
          </Field>
          <Field label="Password" htmlFor="livePassword">
            <input id="livePassword" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass(false)} />
          </Field>
          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
          <div className="flex items-center justify-between">
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-60">
              {busy ? 'Please wait…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => void forgot()} className="text-sm text-slate-500 hover:underline">
              Forgot password
            </button>
          </div>
          <p className="border-t border-slate-100 pt-3 text-sm text-slate-600">
            Want to become a reseller and get a discount?{' '}
            <Link href="/become-a-reseller" className="font-semibold text-emerald-700 hover:underline">
              Click here
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
