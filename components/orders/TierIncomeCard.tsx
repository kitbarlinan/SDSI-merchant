'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/format';
import { tierIncome } from '@/lib/orders';
import type { Order, PackageSale } from '@/lib/types';

/** A reseller sees the tier income earned on the purchases of the resellers up to 3 levels below them. */
export function TierIncomeCard({ userId, sales, orders, refCode }: { userId: string; sales: PackageSale[]; orders: Order[]; refCode?: string }) {
  const { total, pending, rows } = useMemo(() => tierIncome(sales, orders, userId), [sales, orders, userId]);

  return (
    <Card title="Tier income" subtitle="You earn on every purchase of the resellers up to 3 levels below you: the package and their orders. Orders count once delivered.">
      {refCode ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Your referral code: <span className="font-mono font-semibold">{refCode}</span>. Share{' '}
          <span className="font-mono">/become-a-reseller?ref={refCode}</span> so new resellers land under you.
        </p>
      ) : null}
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-500">Earned so far</p>
          <p className="text-xl font-semibold text-emerald-700">{formatCurrency(total)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">On the way (not delivered yet)</p>
          <p className="text-xl font-semibold text-slate-700">{formatCurrency(pending)}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No purchases in your group yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
          {rows.slice(0, 10).map((row) => (
            <li key={`${row.ref}-${row.level}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                {row.name}
                <span className="ml-2 text-xs text-slate-500">
                  {row.kind === 'package' ? 'Package' : row.ref} · Level {row.level} · {formatDate(row.date)}
                  {row.earned ? '' : ' · on the way'}
                </span>
              </span>
              <span className={`font-semibold ${row.earned ? 'text-emerald-700' : 'text-slate-500'}`}>{formatCurrency(row.php)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
