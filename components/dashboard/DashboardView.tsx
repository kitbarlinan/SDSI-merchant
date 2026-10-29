'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BarList } from '@/components/charts/BarList';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PeriodTabs } from '@/components/ui/PeriodTabs';
import { StatCard } from '@/components/ui/StatCard';
import {
  formatCompactPeso,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatShortDate,
} from '@/lib/format';
import { currentRange, diffDays, previousRange, type PeriodKey } from '@/lib/period';
import {
  breakdownByItem,
  buildTrend,
  filterByRange,
  groupSales,
  pctChange,
  sortLedger,
  summarize,
} from '@/lib/reports';
import { useMerchant } from '@/lib/store';
import { CATEGORY_COLORS, CHANNEL_COLORS, PAYMENT_COLORS } from '@/lib/theme';
import { useToday } from '@/lib/use-today';
import type { Category, PaymentMethod, SalesChannel } from '@/lib/types';

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true">
      <div className="h-12 w-72 rounded-xl bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-32 rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-slate-200" />
    </div>
  );
}

export function DashboardView() {
  const { sales, items } = useMerchant();
  const today = useToday();
  const [period, setPeriod] = useState<PeriodKey>('30d');

  const data = useMemo(() => {
    if (!today) return null;

    const range = currentRange(period, today);
    const prevRange = previousRange(period, today);
    const current = filterByRange(sales, range);
    const previous = prevRange ? filterByRange(sales, prevRange) : null;

    const firstSale = sales.reduce<string | null>(
      (min, sale) => (min === null || sale.date < min ? sale.date : min),
      null,
    );
    const start = range.start ?? firstSale ?? today;

    return {
      summary: summarize(current),
      // No sales in the earlier window means there is nothing meaningful to compare against.
      previous: previous && previous.length > 0 ? summarize(previous) : null,
      trend: buildTrend(current, start, range.end),
      byCategory: groupSales(current, (sale) => sale.category),
      byChannel: groupSales(current, (sale) => sale.channel),
      byPayment: groupSales(current, (sale) => sale.paymentMethod),
      topProducts: breakdownByItem(current).slice(0, 6),
      recent: sortLedger(current).slice(0, 6),
      periodDays: range.start ? diffDays(range.start, range.end) + 1 : null,
    };
  }, [sales, today, period]);

  if (!data) return <DashboardSkeleton />;

  const { summary, previous } = data;
  const compareHint = data.periodDays ? `vs previous ${data.periodDays} days` : 'all-time totals';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How the business is doing at a glance."
        actions={<PeriodTabs value={period} onChange={setPeriod} />}
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="reports"
          label="Total revenue"
          value={formatCurrency(summary.revenue)}
          delta={previous ? pctChange(summary.revenue, previous.revenue) : undefined}
          hint={previous ? compareHint : `${formatNumber(summary.units)} units sold`}
        />
        <StatCard
          icon="inventory"
          label="Estimated COGS"
          value={formatCurrency(summary.cogs)}
          delta={previous ? pctChange(summary.cogs, previous.cogs) : undefined}
          invertDelta
          hint={previous ? compareHint : 'Quantity × unit cost'}
        />
        <StatCard
          icon="leaf"
          label="Gross profit"
          value={formatCurrency(summary.profit)}
          delta={previous ? pctChange(summary.profit, previous.profit) : undefined}
          hint={`${formatPercent(summary.margin)} margin`}
        />
        <StatCard
          icon="sales"
          label="Orders"
          value={formatNumber(summary.transactions)}
          delta={previous ? pctChange(summary.transactions, previous.transactions) : undefined}
          hint={`Avg ${formatCurrency(summary.avgOrder)} per order`}
        />
      </div>

      {/* Trend + categories */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card
          className="lg:col-span-3"
          title="Revenue & profit"
          subtitle="Hover the chart for daily figures"
        >
          <TrendChart data={data.trend} />
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

      {/* Products, channels, payments */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Top products" subtitle="By revenue">
          <BarList
            items={data.topProducts.map((row) => ({
              key: row.itemId,
              label: row.name,
              sublabel: `${formatNumber(row.units)} units · profit ${formatCurrency(row.profit)}`,
              value: row.revenue,
              display: formatCurrency(row.revenue),
              color: CATEGORY_COLORS[row.category],
            }))}
          />
        </Card>
        <Card title="Sales channels" subtitle="Where orders come from">
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
        <Card title="Payment methods" subtitle="How customers pay">
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
      </div>

      {/* Alerts + recent orders */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <AlertsPanel items={items} sales={sales} today={today} />
        </div>
        <Card
          className="lg:col-span-3"
          flush
          title="Recent orders"
          action={
            <Link href="/reports" className="text-xs font-medium text-emerald-700 hover:underline">
              Full ledger
            </Link>
          }
        >
          {data.recent.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-500">No orders in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Order</th>
                    <th className="px-3 py-2.5">Product</th>
                    <th className="hidden px-3 py-2.5 sm:table-cell">Channel</th>
                    <th className="px-5 py-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recent.map((sale) => (
                    <tr key={sale.id}>
                      <td className="whitespace-nowrap px-5 py-3">
                        <p className="font-mono text-xs text-slate-500">{sale.id}</p>
                        <p className="text-xs text-slate-500">{formatShortDate(sale.date)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="max-w-[16rem] truncate font-medium text-slate-900">
                          {sale.quantity} × {sale.itemName}
                        </p>
                        <p className="text-xs text-slate-500">{sale.customerName}</p>
                      </td>
                      <td className="hidden px-3 py-3 sm:table-cell">
                        <Badge tone="slate">{sale.channel}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-right font-semibold">
                        {formatCurrency(sale.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
