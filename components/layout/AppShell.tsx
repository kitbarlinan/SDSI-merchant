'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { getStockStatus } from '@/lib/inventory';
import { useMerchant } from '@/lib/store';

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/sales', label: 'Sales Input', icon: 'sales' },
  { href: '/inventory', label: 'Inventory', icon: 'inventory' },
  { href: '/reports', label: 'Reports', icon: 'reports' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { items, resetDemo } = useMerchant();
  const alertCount = items.filter((item) => getStockStatus(item) !== 'ok').length;

  const handleReset = () => {
    if (window.confirm('Reset everything back to the demo data?')) resetDemo();
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            M
          </span>
          <span className="text-base font-semibold tracking-tight">Merchant Manager</span>
        </div>
        <nav className="flex-1 space-y-1 p-4" aria-label="Main">
          {NAV.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon name={link.icon} />
              <span className="flex-1">{link.label}</span>
              {link.href === '/inventory' && alertCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {alertCount}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={handleReset}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <Icon name="reset" className="h-4 w-4" />
            Reset demo data
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar + tabs */}
        <div className="border-b border-slate-200 bg-white md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
                M
              </span>
              <span className="font-semibold tracking-tight">Merchant Manager</span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset demo data"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <Icon name="reset" className="h-4 w-4" />
            </button>
          </div>
          <nav className="flex gap-1 px-2 pb-2" aria-label="Main">
            {NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? 'page' : undefined}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium ${
                  isActive(link.href)
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon name={link.icon} className="h-4 w-4" />
                {link.label}
                {link.href === '/inventory' && alertCount > 0 ? (
                  <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                    {alertCount}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
