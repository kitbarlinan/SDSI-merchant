'use client';

import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { ROLE_LABEL } from '@/lib/roles';
import { useAppData } from '@/lib/store';
import type { Role, User } from '@/lib/types';

const ROLE_BLURB: Record<Role, string> = {
  admin: 'Sees everything: all merchants, orders, inventory and the accounting.',
  cashier:
    'Packs and ships orders, collects payment, runs the walk-in counter, receives stock and returns.',
  clerk: 'Approves received stock and returns before they go on the shelf.',
  merchant: 'Places orders, tracks own sales and running inventory.',
  customer: 'Reseller or distributor. Orders for pickup only, with a discount, and sees only their own orders.',
};

export function LoginScreen() {
  const { users, login } = useAuth();
  const { merchants } = useAppData();

  const merchantName = (user: User) =>
    merchants.find((merchant) => merchant.id === user.merchantId)?.name;

  const groups: Role[] = ['admin', 'cashier', 'clerk', 'merchant', 'customer'];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-900 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 text-emerald-950 shadow">
            <Icon name="leaf" className="h-6 w-6" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">{BRAND.name}</p>
            <p className="text-sm text-emerald-200/80">{BRAND.tagline}</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Choose an account to continue.</p>

          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <span className="font-semibold">Demo mode.</span> There is no password yet, so anyone can pick
            any account. Real sign-in comes with the database.
          </p>

          <div className="mt-5 space-y-5">
            {groups.map((role) => {
              const accounts = users.filter((user) => user.role === role);
              return (
                <div key={role}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {ROLE_LABEL[role]}
                  </p>
                  <p className="mb-2 text-xs text-slate-500">{ROLE_BLURB[role]}</p>
                  <div className="space-y-2">
                    {accounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        onClick={() => login(account.id)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
                          {account.name.charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {account.name}
                          </span>
                          <span className="block truncate text-xs text-slate-500">
                            {merchantName(account) ?? ROLE_LABEL[account.role]}
                          </span>
                        </span>
                        <Icon
                          name="arrowUp"
                          className="h-4 w-4 rotate-90 text-slate-300 group-hover:text-emerald-600"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
