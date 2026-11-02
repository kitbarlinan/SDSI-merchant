'use client';

import { useState } from 'react';
import { Field, inputClass } from '@/components/ui/Field';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

/** After an invitation or a reset link: the person chooses their own password. */
export function SetPasswordScreen() {
  const { setNewPassword, logout, signedInEmail } = useAuth();
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 px-4 py-10">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password !== again) return setError('The two passwords do not match.');
          setBusy(true);
          setError(await setNewPassword(password));
          setBusy(false);
        }}
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Welcome to {BRAND.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose your password{signedInEmail ? ` for ${signedInEmail}` : ''}. You will use it, with your email, every time you sign in.
          </p>
        </div>
        <Field label="New password (8+ characters)" htmlFor="setPassword">
          <input id="setPassword" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass(false)} />
        </Field>
        <Field label="Type the password again" htmlFor="setPasswordAgain">
          <input id="setPasswordAgain" type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} className={inputClass(false)} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-60">
            Save and continue
          </button>
          <button type="button" onClick={logout} className="text-sm text-slate-500 hover:underline">
            Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
