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
import { MOCK_USERS } from './mock-data';
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
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SESSION_KEY);
      if (saved && MOCK_USERS.some((candidate) => candidate.id === saved)) setUserId(saved);
    } catch {
      // Storage unavailable: start signed out.
    }
    setReady(true);
  }, []);

  const login = useCallback((id: string) => {
    if (!MOCK_USERS.some((candidate) => candidate.id === id)) return;
    setUserId(id);
    try {
      window.localStorage.setItem(SESSION_KEY, id);
    } catch {
      // Ignore.
    }
  }, []);

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
      user: MOCK_USERS.find((candidate) => candidate.id === userId) ?? null,
      users: MOCK_USERS,
      ready,
      login,
      logout,
    }),
    [userId, ready, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}
