'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { BRAND } from '@/lib/brand';
import { getStockStatus } from '@/lib/inventory';
import { useMerchant } from '@/lib/store';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/sales', label: 'Sales Input', icon: 'sales' },
  { href: '/inventory', label: 'Inventory', icon: 'inventory' },
  { href: '/reports', label: 'Reports', icon: 'reports' },
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
  const { items, resetDemo } = useMerchant();
  const alertCount = items.filter((item) => getStockStatus(item) !== 'ok').length;

  const handleReset = () => {
    if (window.confirm('Reset everything back to the demo data? Your changes will be lost.')) {
      resetDemo();
    }
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-emerald-950 md:flex">
        <div className="px-6 pb-6 pt-7">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Main">
          {NAV.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-emerald-100/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon
                  name={link.icon}
                  className={`h-5 w-5 ${active ? 'text-emerald-300' : 'text-emerald-200/60 group-hover:text-emerald-200'}`}
                />
                <span className="flex-1">{link.label}</span>
                {link.href === '/inventory' && alertCount > 0 ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                    {alertCount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={handleReset}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-emerald-100/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon name="reset" className="h-4 w-4" />
            Reset demo data
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar + tabs */}
        <div className="bg-emerald-950 md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Logo small />
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset demo data"
              className="rounded-lg p-2 text-emerald-100/70 hover:bg-white/10"
            >
              <Icon name="reset" className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-2" aria-label="Main">
            {NAV.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium ${
                    active ? 'bg-white/10 text-white' : 'text-emerald-100/70 hover:bg-white/5'
                  }`}
                >
                  <Icon name={link.icon} className="h-4 w-4" />
                  {link.label}
                  {link.href === '/inventory' && alertCount > 0 ? (
                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-amber-950">
                      {alertCount}
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
