'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/roles';

/** Sends each role to its own landing page after sign-in. */
export default function HomePage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready && user) router.replace(homeFor(user.role));
  }, [ready, user, router]);

  return <p className="animate-pulse text-sm text-slate-500">Loading…</p>;
}
