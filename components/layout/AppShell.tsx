'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { getStockStatus } from '@/lib/inventory';
import { isOpen } from '@/lib/orders';
import { ROLE_LABEL, canApprove } from '@/lib/roles';
import { useAppData } from '@/lib/store';
import type { Role } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  /** Overrides the label for merchants. */
  merchantLabel?: string;
  icon: IconName;
  roles: Role[];
  badge?: 'orders' | 'inventory';
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'merchant'] },
  { href: '/orders/new', label: 'New Order', icon: 'plus', roles: ['merchant'] },
  {
    href: '/orders',
    label: 'Orders',
    merchantLabel: 'My Orders',
    icon: 'orders',
    roles: ['admin', 'cashier', 'clerk', 'merchant'],
    badge: 'orders',
  },
  { href: '/pos', label: 'Walk-in POS', icon: 'pos', roles: ['admin', 'cashier'] },
  {
    href: '/inventory',
    label: 'Inventory',
    icon: 'inventory',
    roles: ['admin', 'cashier', 'clerk', 'merchant'],
    badge: 'inventory',
  },
  { href: '/accounting', label: 'Accounting', icon: 'wallet', roles: ['admin'] },
];

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-emerald-300 to-teal-400 text-emerald-950 shadow-sm ${
          small ? 'h-8 w-8' : 'h-10 w-10'
        }`}
      >
        <Icon name="leaf" className={small ? 'h-4 w-4' : 'h-5 w-5'} />
      </span>
      <div className="leading-tight">
        <p className={`font-semibold tracking-tight text-white ${small ? 'text-sm' : 'text-base'}`}>
          {BRAND.name}
        </p>
        {small ? null : <p className="text-xs text-emerald-200/70">{BRAND.tagline}</p>}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, ready, logout } = useAuth();
  const { items, orders, receipts, merchants, resetDemo } = useAppData();

  const visibleNav = useMemo(
    () => (user ? NAV.filter((entry) => entry.roles.includes(user.role)) : []),
    [user],
  );

  // The most specific nav entry wins, so /orders/new does not also light up "Orders".
  const activeHref = useMemo(
    () =>
      visibleNav
        .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href,
    [visibleNav, pathname],
  );

  const badges = useMemo(() => {
    if (!user) return { orders: 0, inventory: 0 };
    const mine = <T extends { merchantId: string }>(rows: T[]) =>
      user.role === 'merchant' ? rows.filter((row) => row.merchantId === user.merchantId) : rows;
    // Approvers see how many receipts wait for them; everyone else sees low-stock products.
    const approver = canApprove(user.role);
    return {
      orders: mine(orders).filter(isOpen).length,
      inventory: approver
        ? receipts.filter((receipt) => receipt.status === 'pending').length
        : mine(items).filter((item) => getStockStatus(item) !== 'ok').length,
    };
  }, [user, orders, items, receipts]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-emerald-950 text-emerald-100">
        <p className="animate-pulse text-sm">Loading…</p>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  const merchantName =
    user.role === 'merchant'
      ? merchants.find((merchant) => merchant.id === user.merchantId)?.name
      : undefined;
  const subtitle = merchantName ?? ROLE_LABEL[user.role];

  const handleReset = () => {
    if (window.confirm('Reset everything back to the demo data? Your changes will be lost.')) {
      resetDemo();
    }
  };

  const labelOf = (entry: NavItem) =>
    user.role === 'merchant' && entry.merchantLabel ? entry.merchantLabel : entry.label;

  const badgeOf = (entry: NavItem) => (entry.badge ? badges[entry.badge] : 0);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-emerald-950 md:flex">
        <div className="px-6 pb-6 pt-7">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {visibleNav.map((entry) => {
            const active = entry.href === activeHref;
            const count = badgeOf(entry);
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon
                  name={entry.icon}
                  className={`h-5 w-5 ${active ? 'text-emerald-300' : 'text-emerald-200/60 group-hover:text-emerald-200'}`}
                />
                <span className="flex-1">{labelOf(entry)}</span>
                {count > 0 ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-white/10 p-4">
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-300 text-sm font-semibold text-emerald-950">
              {user.name.charAt(0)}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-emerald-200/70">
                {merchantName ? `Merchant · ${merchantName}` : subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-emerald-100/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="logout" className="h-4 w-4" />
            Switch account
          </button>
          {user.role === 'admin' ? (
            <button
              type="button"
              onClick={handleReset}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-emerald-100/50 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Icon name="reset" className="h-4 w-4" />
              Reset demo data
            </button>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar + tabs */}
        <div className="bg-emerald-950 md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Logo small />
            <div className="flex items-center gap-1">
              <span className="max-w-[9rem] truncate text-xs text-emerald-200/80">{user.name}</span>
              <button
                type="button"
                onClick={logout}
                aria-label="Switch account"
                className="rounded-lg p-2 text-emerald-100/70 hover:bg-white/10"
              >
                <Icon name="logout" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2" aria-label="Main">
            {visibleNav.map((entry) => {
              const active = entry.href === activeHref;
              const count = badgeOf(entry);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
                    active ? 'bg-white/10 text-white' : 'text-emerald-100/70 hover:bg-white/5'
                  }`}
                >
                  <Icon name={entry.icon} className="h-4 w-4" />
                  {labelOf(entry)}
                  {count > 0 ? (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">
                      {count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
