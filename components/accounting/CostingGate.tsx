'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { inputClass } from '@/components/ui/Field';
import {
  changeCostingPassword,
  hasCostingPassword,
  passwordProblem,
  setCostingPassword,
  verifyCostingPassword,
} from '@/lib/costing-lock';

const IDLE_LOCK_MS = 5 * 60 * 1000;

export interface CostingSession {
  /** Checks the password again. Used before every save. */
  confirmPassword: (password: string) => Promise<boolean>;
  changePassword: (current: string, next: string) => Promise<void>;
  lock: () => void;
}

/**
 * Locks the costing screen behind its own password (separate from the account sign-in).
 * It locks again after 5 minutes without activity, when the tab is left, or on "Lock now".
 * Demo-level protection only: see lib/costing-lock.ts.
 */
export function CostingGate({ children }: { children: (session: CostingSession) => ReactNode }) {
  const [phase, setPhase] = useState<'loading' | 'setup' | 'locked' | 'open'>('loading');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setPhase(hasCostingPassword() ? 'locked' : 'setup');
  }, []);

  const lock = useCallback(() => {
    setPhase(hasCostingPassword() ? 'locked' : 'setup');
    setPassword('');
    setConfirm('');
    setError(null);
  }, []);

  // Auto-lock after inactivity.
  useEffect(() => {
    if (phase !== 'open') return;
    const reset = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(lock, IDLE_LOCK_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((name) => window.addEventListener(name, reset));
    reset();
    return () => {
      events.forEach((name) => window.removeEventListener(name, reset));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [phase, lock]);

  async function submitSetup(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      await setCostingPassword(password);
      setPassword('');
      setConfirm('');
      setError(null);
      setPhase('open');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the password.');
    } finally {
      setBusy(false);
    }
  }

  async function submitUnlock(event: FormEvent) {
    event.preventDefault();
    const wait = blockedUntil - Date.now();
    if (wait > 0) return setError(`Too many wrong attempts. Try again in ${Math.ceil(wait / 1000)} seconds.`);
    setBusy(true);
    try {
      if (await verifyCostingPassword(password)) {
        setFailures(0);
        setPassword('');
        setError(null);
        setPhase('open');
      } else {
        const next = failures + 1;
        setFailures(next);
        if (next >= 3) {
          setBlockedUntil(Date.now() + 30_000 * (next - 2));
          setError('Wrong password. Locked for a short while.');
        } else {
          setError('Wrong password.');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check the password.');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'loading') return <p className="py-10 text-center text-sm text-slate-500">Loading…</p>;

  if (phase === 'open') {
    return (
      <>
        {children({
          confirmPassword: verifyCostingPassword,
          changePassword: changeCostingPassword,
          lock,
        })}
      </>
    );
  }

  const setup = phase === 'setup';
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-700">
        <Icon name="wallet" className="h-6 w-6" />
      </span>
      <h2 className="mt-4 text-center text-lg font-semibold text-slate-900">
        {setup ? 'Set a costing password' : 'Costing is locked'}
      </h2>
      <p className="mt-1 text-center text-sm text-slate-500">
        {setup
          ? 'The costing decides what merchants are paid, so it has its own password. Only the admin should know it.'
          : 'Enter the costing password to view or edit the pickup prices.'}
      </p>

      <form onSubmit={setup ? submitSetup : submitUnlock} className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          {setup ? 'New password' : 'Password'}
          <input
            type="password"
            autoFocus
            autoComplete={setup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`mt-1 ${inputClass(Boolean(error))}`}
          />
        </label>
        {setup ? (
          <label className="block text-sm font-medium text-slate-700">
            Confirm password
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              className={`mt-1 ${inputClass(Boolean(error))}`}
            />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              At least 8 characters, with letters and numbers.
            </span>
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy || password === ''}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Please wait…' : setup ? 'Set password and open costing' : 'Unlock costing'}
        </button>
      </form>

      <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        <span className="font-semibold">Demo note.</span> This lock only hides the screen in this browser.
        Real protection needs the database: costing readable by the admin only, and the password checked
        on the server before any save.
      </p>
    </div>
  );
}
