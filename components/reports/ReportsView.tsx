'use client';

import { useMemo, useState } from 'react';
import { BarList } from '@/components/charts/BarList';
import { DonutChart } from '@/components/charts/DonutChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { PeriodTabs } from '@/components/ui/PeriodTabs';
import { StatCard } from '@/components/ui/StatCard';
import {
  formatCompactPeso,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  roundMoney,
} from '@/lib/format';
import { currentRange, diffDays, previousRange, type PeriodKey } from '@/lib/period';
import {
  breakdownByItem,
  filterByRange,
  groupSales,
  pctChange,
  sortLedger,
  summarize,
} from '@/lib/reports';
import { useMerchant } from '@/lib/store';
import { CATEGORY_COLORS, CHANNEL_COLORS, PAYMENT_COLORS } from '@/lib/theme';
import { useToday } from '@/lib/use-today';
import {
  PAYMENT_METHODS,
  SALES_CHANNELS,
  type Category,
  type PaymentMethod,
  type Sale,
  type SalesChannel,
} from '@/lib/types';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
  // BOM so Excel opens the peso values and names with the right encoding.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ledgerToCsv(sales: Sale[]): (string | number)[][] {
  return [
    ['Date', 'Ref', 'Customer', 'Product', 'SKU', 'Category', 'Qty', 'Unit price', 'Total', 'COGS', 'Profit', 'Channel', 'Payment'],
    ...sales.map((sale) => {
      const cogs = roundMoney(sale.quantity * sale.unitCost);
      return [
        sale.date,
        sale.id,
        sale.customerName,
        sale.itemName,
        sale.sku,
        sale.category,
        sale.quantity,
        sale.unitPrice,
        sale.total,
        cogs,
        roundMoney(sale.total - cogs),
        sale.channel,
        sale.paymentMethod,
      ];
    }),
  ];
}

export function ReportsView() {
  const { sales } = useMerchant();
  const today = useToday();
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [query, setQuery] = useState('');
  const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
  const [channel, setChannel] = useState<SalesChannel | 'all'>('all');

  const data = useMemo(() => {
    if (!today) return null;
    const range = currentRange(period, today);
    const prevRange = previousRange(period, today);
    const current = filterByRange(sales, range);
    const earlier = prevRange ? filterByRange(sales, prevRange) : [];
    return {
      current,
      summary: summarize(current),
      // No sales in the earlier window means there is nothing meaningful to compare against.
      previous: earlier.length > 0 ? summarize(earlier) : null,
      byItem: breakdownByItem(current),
      byCategory: groupSales(current, (sale) => sale.category),
      byChannel: groupSales(current, (sale) => sale.channel),
      byPayment: groupSales(current, (sale) => sale.paymentMethod),
      customers: groupSales(current, (sale) => sale.customerName).slice(0, 5),
      periodDays: range.start ? diffDays(range.start, range.end) + 1 : null,
    };
  }, [sales, today, period]);

  const ledger = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return sortLedger(data.current).filter((sale) => {
      if (method !== 'all' && sale.paymentMethod !== method) return false;
      if (channel !== 'all' && sale.channel !== channel) return false;
      if (!needle) return true;
      return [sale.id, sale.customerName, sale.itemName, sale.sku].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [data, query, method, channel]);

  const ledgerTotals = useMemo(() => summarize(ledger), [ledger]);

  const header = (
    <PageHeader
      title="Accounting & Reports"
      description="Revenue, estimated cost of goods sold, profit, and the full sales ledger."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <PeriodTabs value={period} onChange={setPeriod} />
          <button
            type="button"
            disabled={ledger.length === 0}
            onClick={() => downloadCsv(`sales-ledger-${today}.csv`, ledgerToCsv(ledger))}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="download" className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      }
    />
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        <div className="animate-pulse space-y-6" aria-busy="true">
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-32 rounded-2xl bg-slate-200" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-slate-200" />
        </div>
      </div>
    );
  }

  const { summary, previous } = data;
  const compareHint = data.periodDays ? `vs previous ${data.periodDays} days` : 'all-time totals';

  return (
    <div className="space-y-6">
      {header}

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          variant="primary"
          icon="reports"
          label="Total revenue"
          value={formatCurrency(summary.revenue)}
          delta={previous ? pctChange(summary.revenue, previous.revenue) : undefined}
          hint={
            previous
              ? compareHint
              : `${formatNumber(summary.transactions)} transactions · ${formatNumber(summary.units)} units`
          }
        />
        <StatCard
          icon="inventory"
          label="Estimated COGS"
          value={formatCurrency(summary.cogs)}
          delta={previous ? pctChange(summary.cogs, previous.cogs) : undefined}
          invertDelta
          hint={previous ? compareHint : 'Quantity × unit cost at time of sale'}
        />
        <StatCard
          icon="leaf"
          label="Net profit (est.)"
          value={formatCurrency(summary.profit)}
          delta={previous ? pctChange(summary.profit, previous.profit) : undefined}
          hint={`${formatPercent(summary.margin)} margin · before operating expenses`}
        />
      </div>

      {/* Products + categories */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3" flush title="Sales by product" subtitle="Profit per product in this period">
          {data.byItem.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No sales in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Product</th>
                    <th className="px-3 py-2.5 text-right">Units</th>
                    <th className="px-3 py-2.5 text-right">Revenue</th>
                    <th className="px-3 py-2.5 text-right">COGS</th>
                    <th className="px-3 py-2.5 text-right">Profit</th>
                    <th className="px-5 py-2.5 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byItem.map((row) => (
                    <tr key={row.itemId}>
                      <td className="px-5 py-3">
                        <p className="flex items-center gap-2 font-medium text-slate-900">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: CATEGORY_COLORS[row.category] }}
                          />
                          <span className="max-w-[15rem] truncate">{row.name}</span>
                        </p>
                      </td>
                      <td className="px-3 py-3 text-right">{formatNumber(row.units)}</td>
                      <td className="px-3 py-3 text-right font-medium">{formatCurrency(row.revenue)}</td>
                      <td className="px-3 py-3 text-right text-slate-600">{formatCurrency(row.cogs)}</td>
                      <td className="px-3 py-3 text-right font-medium text-emerald-700">
                        {formatCurrency(row.profit)}
                      </td>
                      <td className="px-5 py-3 text-right text-slate-600">
                        {formatPercent(row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Sales by category" subtitle="Share of revenue">
          <DonutChart
            centerLabel="Revenue"
            centerValue={formatCompactPeso(summary.revenue)}
            slices={data.byCategory.map((row) => ({
              label: row.key,
              value: row.revenue,
              color: CATEGORY_COLORS[row.key as Category] ?? '#94a3b8',
            }))}
          />
        </Card>
      </div>

      {/* Channel, payment, customers */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="By sales channel">
          <BarList
            items={data.byChannel.map((row) => ({
              key: row.key,
              label: row.key,
              sublabel: `${formatNumber(row.orders)} orders · ${formatPercent(row.share)}`,
              value: row.revenue,
              display: formatCurrency(row.revenue),
              color: CHANNEL_COLORS[row.key as SalesChannel],
            }))}
          />
        </Card>
        <Card title="By payment method">
          <BarList
            items={data.byPayment.map((row) => ({
              key: row.key,
              label: row.key,
              sublabel: `${formatNumber(row.orders)} orders · ${formatPercent(row.share)}`,
              value: row.revenue,
              display: formatCurrency(row.revenue),
              color: PAYMENT_COLORS[row.key as PaymentMethod],
            }))}
          />
        </Card>
        <Card title="Top customers" subtitle="By revenue">
          <BarList
            items={data.customers.map((row) => ({
              key: row.key,
              label: row.key,
              sublabel: `${formatNumber(row.orders)} orders · ${formatNumber(row.units)} units`,
              value: row.revenue,
              display: formatCurrency(row.revenue),
            }))}
          />
        </Card>
      </div>

      {/* Ledger */}
      <Card
        flush
        title="Sales ledger"
        subtitle="Every transaction in the selected period"
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
                placeholder="Search ref, customer, product"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-60"
              />
            </label>
            <label>
              <span className="sr-only">Filter by channel</span>
              <select
                value={channel}
                onChange={(event) => setChannel(event.target.value as SalesChannel | 'all')}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="all">All channels</option>
                {SALES_CHANNELS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filter by payment method</span>
              <select
                value={method}
                onChange={(event) => setMethod(event.target.value as PaymentMethod | 'all')}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
        }
      >
        <div className="max-h-[32rem] overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Profit</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-5 py-3">Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-slate-500">
                    No transactions match your filters.
                  </td>
                </tr>
              ) : (
                ledger.map((sale) => {
                  const cogs = roundMoney(sale.quantity * sale.unitCost);
                  const profit = roundMoney(sale.total - cogs);
                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                        {formatDate(sale.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{sale.id}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-900">{sale.customerName}</td>
                      <td className="px-4 py-3">
                        <p className="max-w-[16rem] truncate text-slate-900">{sale.itemName}</p>
                        <p className="font-mono text-xs text-slate-500">{sale.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-right">{formatNumber(sale.quantity)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(sale.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(sale.total)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(cogs)}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          profit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                        }`}
                      >
                        {formatCurrency(profit)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone="slate">{sale.channel}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone="green">{sale.paymentMethod}</Badge>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {ledger.length > 0 ? (
              <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-50 text-sm font-semibold">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-slate-600">
                    {ledger.length === data.current.length
                      ? `Totals (${formatNumber(ledger.length)} transactions)`
                      : `Totals (${formatNumber(ledger.length)} of ${formatNumber(data.current.length)} shown)`}
                  </td>
                  <td className="px-4 py-3 text-right">{formatNumber(ledgerTotals.units)}</td>
                  <td />
                  <td className="px-4 py-3 text-right">{formatCurrency(ledgerTotals.revenue)}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(ledgerTotals.cogs)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {formatCurrency(ledgerTotals.profit)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </Card>
    </div>
  );
}
