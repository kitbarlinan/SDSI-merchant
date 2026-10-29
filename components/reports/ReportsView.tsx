'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { formatCurrency, formatDate, formatNumber, formatPercent, roundMoney } from '@/lib/format';
import { breakdownByItem, breakdownByPayment, sortLedger, summarize } from '@/lib/reports';
import { useMerchant } from '@/lib/store';
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/types';

export function ReportsView() {
  const { sales } = useMerchant();
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');

  const summary = useMemo(() => summarize(sales), [sales]);
  const byItem = useMemo(() => breakdownByItem(sales), [sales]);
  const byPayment = useMemo(() => breakdownByPayment(sales), [sales]);

  const ledger = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortLedger(sales).filter((sale) => {
      if (method !== 'all' && sale.paymentMethod !== method) return false;
      if (!needle) return true;
      return [sale.id, sale.customerName, sale.itemName, sale.sku].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [sales, query, method]);

  const ledgerTotals = useMemo(() => summarize(ledger), [ledger]);
  const topItemRevenue = byItem[0]?.revenue ?? 0;

  return (
    <div className="space-y-6">
      {/* Dashboard summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Total revenue"
          value={formatCurrency(summary.revenue)}
          accent="indigo"
          hint={`${formatNumber(summary.transactions)} transactions · ${formatNumber(summary.units)} units sold`}
        />
        <StatCard
          label="Estimated COGS"
          value={formatCurrency(summary.cogs)}
          accent="amber"
          hint="Quantity × unit cost at time of sale"
        />
        <StatCard
          label="Net profit (est.)"
          value={formatCurrency(summary.profit)}
          accent={summary.profit >= 0 ? 'emerald' : 'rose'}
          hint={`${formatPercent(summary.margin)} margin · before operating expenses`}
        />
      </div>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold">Sales by item</h2>
          </div>
          {byItem.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No sales yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byItem.map((row) => (
                <li key={row.itemId} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.units)} units · profit {formatCurrency(row.profit)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{formatCurrency(row.revenue)}</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${topItemRevenue > 0 ? (row.revenue / topItemRevenue) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-base font-semibold">Sales by payment method</h2>
          </div>
          {byPayment.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">No sales yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {byPayment.map((row) => (
                <li key={row.method} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{row.method}</p>
                      <p className="text-xs text-slate-500">
                        {formatNumber(row.count)} transaction{row.count === 1 ? '' : 's'} ·{' '}
                        {formatPercent(row.share)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold">{formatCurrency(row.revenue)}</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${row.share}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sales ledger */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold">Sales ledger</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative block">
              <span className="sr-only">Search ledger</span>
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ref, customer, item"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-64"
              />
            </label>
            <label>
              <span className="sr-only">Filter by payment method</span>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod | 'all')}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">All payment methods</option>
                {PAYMENT_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Profit</th>
                <th className="px-6 py-3">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-slate-500">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                ledger.map((sale) => {
                  const cogs = roundMoney(sale.quantity * sale.unitCost);
                  const profit = roundMoney(sale.total - cogs);
                  return (
                    <tr key={sale.id}>
                      <td className="whitespace-nowrap px-6 py-3.5 text-slate-600">
                        {formatDate(sale.date)}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-slate-500">{sale.id}</td>
                      <td className="px-4 py-3.5 text-slate-900">{sale.customerName}</td>
                      <td className="px-4 py-3.5">
                        <p className="text-slate-900">{sale.itemName}</p>
                        <p className="font-mono text-xs text-slate-500">{sale.sku}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">{formatNumber(sale.quantity)}</td>
                      <td className="px-4 py-3.5 text-right">{formatCurrency(sale.unitPrice)}</td>
                      <td className="px-4 py-3.5 text-right font-medium">
                        {formatCurrency(sale.total)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-600">{formatCurrency(cogs)}</td>
                      <td
                        className={`px-4 py-3.5 text-right font-medium ${
                          profit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(profit)}
                      </td>
                      <td className="px-6 py-3.5">
                        <Badge tone="indigo">{sale.paymentMethod}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {ledger.length > 0 ? (
              <tfoot className="border-t border-slate-200 bg-slate-50 text-sm font-semibold">
                <tr>
                  <td colSpan={4} className="px-6 py-3 text-slate-600">
                    {ledger.length === sales.length
                      ? 'Totals'
                      : `Totals (${ledger.length} of ${sales.length} shown)`}
                  </td>
                  <td className="px-4 py-3 text-right">{formatNumber(ledgerTotals.units)}</td>
                  <td />
                  <td className="px-4 py-3 text-right">{formatCurrency(ledgerTotals.revenue)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(ledgerTotals.cogs)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {formatCurrency(ledgerTotals.profit)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}
