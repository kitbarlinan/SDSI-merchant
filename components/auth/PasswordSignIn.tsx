'use client';

import { useState } from 'react';
import { Field, inputClass } from '@/components/ui/Field';
import { useAuth } from '@/lib/auth';

/** Sign in with the username and password a reseller got by email. */
export function PasswordSignIn() {
  const { loginWithPassword } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!loginWithPassword(username, password)) setError('Wrong username or password.');
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resellers: sign in with your details</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Username" htmlFor="signInUsername">
          <input id="signInUsername" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass(false)} />
        </Field>
        <Field label="Password" htmlFor="signInPassword">
          <input id="signInPassword" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass(false)} />
        </Field>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
        Sign in
      </button>
    </form>
  );
}
