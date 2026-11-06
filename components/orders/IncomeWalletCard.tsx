'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/format';
import { tierIncome } from '@/lib/orders';
import { referralRows } from '@/lib/referral';
import { useAppData } from '@/lib/store';
import type { Order, PackageSale } from '@/lib/types';

/** A reseller's income wallet: the total, and where each peso came from (tier income, referral bonus). */
export function IncomeWalletCard({ userId, sales, orders, refCode }: { userId: string; sales: PackageSale[]; orders: Order[]; refCode?: string }) {
  const { costing, merchants } = useAppData();
  const tier = useMemo(() => tierIncome(sales, orders, userId), [sales, orders, userId]);
  const referral = useMemo(() => referralRows(costing, merchants, orders, userId), [costing, merchants, orders, userId]);
  const referralEarned = referral.reduce((n, r) => n + r.earnedPhp, 0);
  const referralPending = referral.reduce((n, r) => n + r.pendingPhp, 0);
  const total = tier.total + referralEarned;
  const pending = tier.pending + referralPending;
  const { tierL1Pct, tierL2Pct, referrerPct } = costing.settings;

  const source = (title: string, hint: string, earned: number, onTheWay: number, tone: string) => (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500">{hint}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{formatCurrency(earned)}</p>
      <p className="text-xs text-slate-500">+ {formatCurrency(onTheWay)} on the way</p>
    </div>
  );

  return (
    <Card title="My income" subtitle="Everything you earn, and where it comes from. Orders count once delivered.">
      {refCode ? (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Your referral code: <span className="font-mono font-semibold">{refCode}</span>. Share{' '}
          <span className="font-mono">/become-a-reseller?ref={refCode}</span> so new resellers land under you.
        </p>
      ) : null}

      <div className="mt-3 rounded-2xl bg-emerald-500 px-5 py-4 text-emerald-950">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-950/70">Total earned</p>
        <p className="text-3xl font-semibold text-emerald-950">{formatCurrency(total)}</p>
        <p className="text-xs text-emerald-950/70">+ {formatCurrency(pending)} on the way (not delivered yet)</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {source('Tier income', `${tierL1Pct}% from your direct team, ${tierL2Pct}% from the level below`, tier.total, tier.pending, 'border-sky-200 bg-sky-50/60')}
        {source('Referral bonus', `${referrerPct}% of the sales of merchants you brought in`, referralEarned, referralPending, 'border-amber-200 bg-amber-50/60')}
      </div>

      {referral.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-slate-800">Merchants you brought in</p>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {referral.map((row) => (
              <li key={row.merchantId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {row.merchantName}
                  <span className="ml-2 text-xs text-slate-500">{row.orders} delivered order{row.orders === 1 ? '' : 's'}</span>
                </span>
                <span className="font-semibold text-emerald-700">
                  {formatCurrency(row.earnedPhp)}
                  {row.pendingPhp > 0 ? <span className="ml-2 text-xs font-normal text-slate-500">+ {formatCurrency(row.pendingPhp)} on the way</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-800">Tier income from your team</p>
        {tier.rows.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No purchases in your team yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
            {tier.rows.slice(0, 10).map((row) => (
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
      </div>
    </Card>
  );
}
