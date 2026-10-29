'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { ROLE_LABEL, homeFor } from '@/lib/roles';
import type { Role } from '@/lib/types';

/** Shows a page only to the listed roles. (Demo only: real enforcement must live on the server.) */
export function RoleGate({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;

  if (!allow.includes(user.role)) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Icon name="alert" className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">This page is not available</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your account ({ROLE_LABEL[user.role]}) does not have access to this page.
        </p>
        <Link
          href={homeFor(user.role)}
          className="mt-5 inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          Go to my home page
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
