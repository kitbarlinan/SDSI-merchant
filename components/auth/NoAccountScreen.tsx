'use client';

import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

/** Signed in with the sign-in service, but the admin has not given this email an account in the app. */
export function NoAccountScreen() {
  const { signedInEmail, accountProblem, logout } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h1 className="text-lg font-semibold text-slate-900">No {BRAND.name} account yet</h1>
        <p className="text-sm text-slate-600">
          {signedInEmail ? `You are signed in as ${signedInEmail}, but ` : ''}
          {accountProblem ?? 'there is no account for this sign-in.'} Ask the admin to invite you.
        </p>
        <button type="button" onClick={logout} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500">
          Sign out
        </button>
      </div>
    </div>
  );
}
