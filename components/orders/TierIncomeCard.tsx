'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/format';
import { tierIncome } from '@/lib/orders';
import type { PackageSale } from '@/lib/types';

/** A reseller sees the tier income earned when someone in their 3 levels below buys the package. */
export function TierIncomeCard({ userId, sales }: { userId: string; sales: PackageSale[] }) {
  const { total, rows } = useMemo(() => tierIncome(sales, userId), [sales, userId]);

  return (
    <Card title="Tier income" subtitle="You earn when a reseller up to 3 levels below you buys the reseller package.">
      <div className="mt-3">
        <p className="text-xs text-slate-500">Earned so far</p>
        <p className="text-xl font-semibold text-emerald-700">{formatCurrency(total)}</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No package sales in your group yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
          {rows.map(({ sale, level, php }) => (
            <li key={`${sale.id}-${level}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                {sale.resellerName}
                <span className="ml-2 text-xs text-slate-500">
                  Level {level} · {formatDate(sale.createdAt.slice(0, 10))}
                </span>
              </span>
              <span className="font-semibold text-emerald-700">{formatCurrency(php)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
