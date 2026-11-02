'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAppData } from './store';
import type { User } from './types';

/**
 * DEMO sign-in: you pick an account, there is no password.
 * Replace with real authentication (for example Supabase Auth) before real use.
 * The rest of the app only depends on `useAuth()`, so the swap stays in this file.
 */
const SESSION_KEY = 'sdsi-wellness:session';

interface AuthValue {
  user: User | null;
  users: User[];
  /** false until the saved session has been read, to avoid flashing the login screen. */
  ready: boolean;
  login: (userId: string) => void;
  /** Sign in with a username and password. false when they do not match. */
  loginWithPassword: (username: string, password: string) => boolean;
  logout: () => void;
  /** Live mode only. In demo mode these do nothing. */
  remote: boolean;
  /** Email of the person signed in to the sign-in service, even when the app has no account for them yet. */
  signedInEmail: string | null;
  /** Signed in, but the admin has not given this email an account. */
  accountProblem: string | null;
  /** True right after an invitation or password-reset link: the person must choose a password. */
  needPassword: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  sendReset: (email: string) => Promise<string | null>;
  setNewPassword: (password: string) => Promise<string | null>;
}

export const AuthContext = createContext<AuthValue | null>(null);
export type { AuthValue };

export const demoOnly = async (): Promise<string | null> => 'Real sign-in is not switched on.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { users: accounts } = useAppData();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SESSION_KEY);
      if (saved) setUserId(saved);
    } catch {
      // Storage unavailable: start signed out.
    }
    setReady(true);
  }, []);

  const login = useCallback((id: string) => {
    if (!accounts.some((candidate) => candidate.id === id)) return;
    setUserId(id);
    try {
      window.localStorage.setItem(SESSION_KEY, id);
    } catch {
      // Ignore.
    }
  }, [accounts]);

  const loginWithPassword = useCallback(
    (username: string, password: string): boolean => {
      const match = accounts.find((candidate) => candidate.username && candidate.username === username.trim().toLowerCase() && candidate.password === password);
      if (!match) return false;
      setUserId(match.id);
      try {
        window.localStorage.setItem(SESSION_KEY, match.id);
      } catch {
        // Ignore.
      }
      return true;
    },
    [accounts],
  );

  const logout = useCallback(() => {
    setUserId(null);
    try {
      window.localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore.
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user: accounts.find((candidate) => candidate.id === userId) ?? null,
      users: accounts,
      ready,
      login,
      loginWithPassword,
      logout,
      remote: false,
      signedInEmail: null,
      accountProblem: null,
      needPassword: false,
      signIn: demoOnly,
      sendReset: demoOnly,
      setNewPassword: demoOnly,
    }),
    [userId, ready, login, loginWithPassword, logout, accounts],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
