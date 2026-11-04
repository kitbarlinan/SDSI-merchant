'use client';

import { useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { InviteActions } from '@/components/team/InviteActions';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatHkd } from '@/lib/format';
import { resellerLedger, resellerSummaries } from '@/lib/reseller';
import { useAppData } from '@/lib/store';

/** Admin and cashier: every reseller, what they got in discount and tier income, and the split of each purchase. */
export function ResellersView() {
  const { user } = useAuth();
  const { users, items, orders, packageSales, costing, outbox } = useAppData();
  const { settings } = costing;
  const nameOf = (id: string) => users.find((candidate) => candidate.id === id)?.name ?? id;
  const ledger = useMemo(() => resellerLedger(orders, packageSales, items, settings.markupPct), [orders, packageSales, items, settings.markupPct]);
  const summaries = useMemo(() => resellerSummaries(users, ledger, packageSales, orders), [users, ledger, packageSales, orders]);
  if (!user) return null;
  const showPeso = user.role === 'admin';

  const counted = ledger.filter((row) => row.counted);
  const sum = (pick: (row: (typeof ledger)[number]) => number) => counted.reduce((total, row) => total + pick(row), 0);
  const tierPaid = sum((row) => row.tiers.reduce((t, tier) => t + tier.php, 0));
  const tierPct = settings.tierL1Pct + settings.tierL2Pct + settings.tierL3Pct;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resellers"
        description={`Buying the reseller package (${formatHkd(settings.packageHkd)}) makes someone a reseller. Every purchase after that has ${settings.resellerDiscountPct}% off, and ${tierPct}% of the SRP goes to the 3 sponsors above (L1 ${settings.tierL1Pct}% · L2 ${settings.tierL2Pct}% · L3 ${settings.tierL3Pct}%). All of it comes out of SDSI's ${settings.markupPct}% top-up.`}
      />

      {showPeso ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="SDSI top-up" value={formatCurrency(sum((row) => row.topUpPhp))} hint={`${settings.markupPct}% of the SRP`} />
          <StatCard label="Reseller discount" value={formatCurrency(sum((row) => row.discountPhp))} hint={`${settings.resellerDiscountPct}% of the SRP`} />
          <StatCard label="Tier income paid" value={formatCurrency(tierPaid)} hint={`up to ${tierPct}% of the SRP`} />
          <StatCard label="SDSI net" value={formatCurrency(sum((row) => row.netPhp))} hint="top-up − discount − tier income" variant="primary" />
        </div>
      ) : null}

      <Card title="Resellers" subtitle="Delivered orders only. The package counts once it is paid.">
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Reseller</th>
                <th className="py-2 pr-4 font-medium">Sponsor</th>
                <th className="py-2 pr-4 font-medium">Package</th>
                <th className="py-2 pr-4 text-right font-medium">Orders</th>
                {user.role === 'admin' ? <th className="py-2 pr-4 font-medium">Login email</th> : null}
                {showPeso ? (
                  <>
                    <th className="py-2 pr-4 text-right font-medium">Bought (SRP)</th>
                    <th className="py-2 pr-4 text-right font-medium">Discount received</th>
                    <th className="py-2 pr-4 text-right font-medium">Tier L1</th>
                    <th className="py-2 pr-4 text-right font-medium">Tier L2</th>
                    <th className="py-2 pr-4 text-right font-medium">Tier L3</th>
                    <th className="py-2 text-right font-medium">Tier total</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaries.map((row) => (
                <tr key={row.user.id}>
                  <td className="py-2 pr-4 font-medium text-slate-900">{row.user.name}</td>
                  <td className="py-2 pr-4 text-slate-600">{row.user.sponsorId ? nameOf(row.user.sponsorId) : '—'}</td>
                  <td className="py-2 pr-4">
                    {row.active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Active · {formatDate(row.packageDate!)}</span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Not bought yet</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{row.orders}</td>
                  {user.role === 'admin' ? (
                    <td className="py-2 pr-4">
                      {row.user.joined ? <span className="text-xs font-medium text-emerald-700">Active</span> : <InviteActions userId={row.user.id} email={row.user.email} />}
                      {row.user.email ? <span className="block text-xs text-slate-500">{row.user.email}</span> : null}
                    </td>
                  ) : null}
                  {showPeso ? (
                    <>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.purchasesPhp)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-emerald-700">{formatCurrency(row.discountPhp)}</td>
                      {row.tierByLevel.map((value, index) => (
                        <td key={index} className="py-2 pr-4 text-right tabular-nums">{formatCurrency(value)}</td>
                      ))}
                      <td className="py-2 text-right font-semibold tabular-nums text-emerald-700">{formatCurrency(row.tierTotal)}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showPeso ? (
        <Card title="Emails sent (demo)" subtitle="When the cashier delivers a package, the buyer gets their temporary username and password by email. In the demo nothing is really sent, so you can read it here. Real sending comes with the database.">
          {outbox.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing sent yet. Apply on /become-a-reseller, then deliver the order as the cashier.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {outbox.map((mail) => (
                <li key={mail.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">
                    To {mail.to} · {mail.subject}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-600">{mail.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {showPeso ? (
        <Card title="Breakdown per purchase" subtitle="Where the top-up goes on each purchase. Pending orders are shown but not counted.">
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Purchase</th>
                  <th className="py-2 pr-4 font-medium">Reseller</th>
                  <th className="py-2 pr-4 text-right font-medium">SRP</th>
                  <th className="py-2 pr-4 text-right font-medium">Top-up</th>
                  <th className="py-2 pr-4 text-right font-medium">Reseller {settings.resellerDiscountPct}%</th>
                  <th className="py-2 pr-4 font-medium">Tier income</th>
                  <th className="py-2 text-right font-medium">SDSI net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.map((row) => (
                  <tr key={`${row.kind}-${row.ref}`} className={row.counted ? '' : 'text-slate-400'}>
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDate(row.date)}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-mono text-xs">{row.ref}</span> · {row.kind}
                      {row.counted ? '' : ' · pending'}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{row.buyerName}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.srpPhp)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.topUpPhp)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{formatCurrency(row.discountPhp)}</td>
                    <td className="py-2 pr-4 text-xs">
                      {row.tiers.length === 0
                        ? 'none (stays with SDSI)'
                        : row.tiers.map((tier) => `L${tier.level} ${nameOf(tier.userId)} ${formatCurrency(tier.php)}`).join(' · ')}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">{formatCurrency(row.netPhp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
