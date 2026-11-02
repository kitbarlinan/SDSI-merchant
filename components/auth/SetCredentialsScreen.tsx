'use client';

import { useState } from 'react';
import { Field, inputClass } from '@/components/ui/Field';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { useAppData } from '@/lib/store';

/** First sign-in with the temporary details: the reseller picks their own username and password. */
export function SetCredentialsScreen() {
  const { user, logout } = useAuth();
  const { changeCredentials } = useAppData();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 px-4 py-10">
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
        onSubmit={async (event) => {
          event.preventDefault();
          if (password !== again) return setError('The two passwords do not match.');
          const result = await changeCredentials(user.id, username, password);
          if (!result.ok) setError(result.error);
        }}
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Welcome to {BRAND.name}, {user.name.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-slate-500">Before you start, choose your own username and password. The temporary ones from the email stop working.</p>
        </div>
        <Field label="New username" htmlFor="newUsername">
          <input id="newUsername" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass(false)} />
        </Field>
        <Field label="New password (8+ characters)" htmlFor="newPassword">
          <input id="newPassword" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass(false)} />
        </Field>
        <Field label="Type the password again" htmlFor="newPasswordAgain">
          <input id="newPasswordAgain" type="password" autoComplete="new-password" value={again} onChange={(event) => setAgain(event.target.value)} className={inputClass(false)} />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between">
          <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500">
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
