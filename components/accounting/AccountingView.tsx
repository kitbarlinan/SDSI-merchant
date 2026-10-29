'use client';

import { useMemo, useState } from 'react';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { DateFilter } from '@/components/ui/DateFilter';
import { MerchantFilter } from '@/components/ui/MerchantFilter';
import { StatCard } from '@/components/ui/StatCard';
import { CostingView } from '@/components/accounting/CostingView';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { flattenDelivered, orderTopUp, orderTotal } from '@/lib/orders';
import { previousOf, trendWindow } from '@/lib/period';
import { buildTrend, filterByRange, groupSales, pctChange, summarize } from '@/lib/reports';
import { useAppData } from '@/lib/store';
import { PAYMENT_COLORS, TERMS_COLORS } from '@/lib/theme';
import type { OrderTerms, PaymentMethod } from '@/lib/types';
import { useDayRange } from '@/lib/use-day-range';

const LEDGER_PAGE = 25;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function AccountingReports() {
  const { user } = useAuth();
  const { orders: allOrders, merchants: allMerchants, costing } = useAppData();
  const topUpPercent = costing.settings.markupPct;
  const { today, range, setRange } = useDayRange();

  const [merchantFilter, setMerchantFilter] = useState('all');
  const [limit, setLimit] = useState(LEDGER_PAGE);

  const merchants = useMemo(
    () => (merchantFilter === 'all' ? allMerchants : allMerchants.filter((m) => m.id === merchantFilter)),
    [allMerchants, merchantFilter],
  );
  const orders = useMemo(
    () => (merchantFilter === 'all' ? allOrders : allOrders.filter((o) => o.merchantId === merchantFilter)),
    [allOrders, merchantFilter],
  );
  const sales = useMemo(() => flattenDelivered(orders), [orders]);

  const current = useMemo(() => filterByRange(sales, range), [sales, range]);
  const summary = summarize(current);
  const prev = summarize(filterByRange(sales, previousOf(range)));

  const window = trendWindow(range);
  const trend = useMemo(() => buildTrend(sales, window.start, window.end), [sales, window.start, window.end]);

  const byMerchant = useMemo(() => groupSales(current, (line) => line.merchantId), [current]);
  const byPayment = useMemo(() => groupSales(current, (line) => line.paymentMethod), [current]);
  const byTerms = useMemo(() => groupSales(current, (line) => line.terms), [current]);

  const ledger = useMemo(
    () =>
      orders
        .filter((order) => {
          if (order.status !== 'delivered' || !order.deliveredAt) return false;
          const day = order.deliveredAt.slice(0, 10);
          return day >= range.start && day <= range.end;
        })
        .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')),
    [orders, range],
  );

  if (!user) return null;
  const merchantName = (id: string) => allMerchants.find((m) => m.id === id)?.name ?? id;

  function exportCsv() {
    const header = [
      'Delivered',
      'Order',
      'Merchant',
      'Customer',
      'Terms',
      'Paid via',
      'Merchant sales',
      'Mark-up % (costing)',
      'SDSI top-up (estimate)',
      'Remit to merchant',
    ];
    const lines = ledger.map((order) => {
      const total = orderTotal(order);
      const topUp = orderTopUp(order);
      return [
        order.deliveredAt ?? '',
        order.id,
        merchantName(order.merchantId),
        order.customerName ?? 'Walk-in',
        order.terms,
        order.paymentMethod ?? '',
        total.toFixed(2),
        order.topUpRate ?? 0,
        topUp.toFixed(2),
        total.toFixed(2),
      ]
        .map(csvCell)
        .join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sdsi-fulfillment-ledger-${range.start}_to_${range.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="SDSI's real revenue as the fulfillment party. Merchant sales are shown as pass-through, not SDSI sales."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <MerchantFilter
          merchants={allMerchants}
          value={merchantFilter}
          onChange={(next) => {
            setMerchantFilter(next);
            setLimit(LEDGER_PAGE);
          }}
        />
        <DateFilter
          value={range}
          today={today}
          onChange={(next) => {
            setRange(next);
            setLimit(LEDGER_PAGE);
          }}
        />
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p className="font-medium">How the numbers work</p>
        <p className="mt-1 text-violet-800">
          SDSI fulfills orders for the merchants, so the cash we collect belongs to them. SDSI&apos;s own
          revenue is only the <strong>top-up</strong>: the costing mark-up ({formatPercent(topUpPercent)}) on the
          merchant&apos;s Net SRP, so 1,485 less 990 = 495 on a 990 SRP. This is an <strong>estimate in pesos</strong>.
          The real top-up (pickup / COD price in HKD, converted, less what we remit) comes later. What SDSI remits
          to the merchant is the Net SRP, with nothing taken out.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="wallet"
          label="SDSI revenue (est. top-up)"
          value={formatCurrency(summary.topUp)}
          hint={`${formatPercent(topUpPercent)} costing mark-up, estimate`}
          delta={pctChange(summary.topUp, prev.topUp)}
        />
        <StatCard
          icon="truck"
          label="Orders fulfilled"
          value={formatNumber(summary.orders)}
          hint={`${formatNumber(summary.units)} units delivered`}
          delta={pctChange(summary.orders, prev.orders)}
        />
        <StatCard
          icon="orders"
          label="Merchant sales handled"
          value={formatCurrency(summary.revenue)}
          hint="Pass-through, not SDSI revenue"
          delta={pctChange(summary.revenue, prev.revenue)}
        />
        <StatCard
          icon="leaf"
          label="Remit to merchants"
          value={formatCurrency(summary.netPayable)}
          hint="Net SRP of delivered orders"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="SDSI top-up over time" subtitle={window.padded ? 'Last 14 days, for context' : 'Revenue earned by SDSI per day'}>
          <TrendChart data={trend} primary="topUp" />
        </Card>

        <Card
          title="Top-up basis"
          subtitle="Taken from Accounting → Costing"
          action={<Badge tone="amber">Estimate</Badge>}
        >
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">{formatPercent(topUpPercent)}</p>
            <p className="text-xs text-slate-500">
              Mark-up on Net SRP, set in the Costing tab. Each delivered order keeps the mark-up it was delivered
              with, so a later change never rewrites past orders.
            </p>
          </div>
        </Card>
      </div>

      <Card
        flush
        title="Merchant statement"
        subtitle="What each merchant sold, what SDSI earned (estimate), and what is remitted to them"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Merchant</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Merchant sales</th>
                <th className="px-4 py-3 text-right">SDSI top-up</th>
                <th className="px-5 py-3 text-right">Remit to merchant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {merchants.map((merchant) => {
                const row = byMerchant.find((r) => r.key === merchant.id);
                const sold = row?.revenue ?? 0;
                const topUp = row?.topUp ?? 0;
                return (
                  <tr key={merchant.id}>
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: merchant.color }} />
                        {merchant.name}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">{formatNumber(row?.orders ?? 0)}</td>
                    <td className="px-4 py-3.5 text-right">{formatCurrency(sold)}</td>
                    <td className="px-4 py-3.5 text-right font-medium text-violet-700">
                      {formatCurrency(topUp)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(sold)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
              <tr>
                <td className="px-5 py-3">Total</td>
                <td className="px-4 py-3 text-right">{formatNumber(summary.orders)}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(summary.revenue)}</td>
                <td className="px-4 py-3 text-right text-violet-700">{formatCurrency(summary.topUp)}</td>
                <td className="px-5 py-3 text-right">{formatCurrency(summary.netPayable)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Collections by payment method" subtitle="Cash SDSI collected on merchants' behalf">
          <DonutChart
            centerLabel="Collected"
            centerValue={formatCurrency(summary.revenue)}
            slices={byPayment.map((row) => ({
              label: row.key,
              value: row.revenue,
              color: PAYMENT_COLORS[row.key as PaymentMethod],
            }))}
          />
        </Card>
        <Card title="Pickup vs delivery" subtitle="COP = cash on pickup, COD = cash on delivery">
          <DonutChart
            centerLabel="Orders"
            centerValue={formatNumber(summary.orders)}
            slices={byTerms.map((row) => ({
              label: row.key,
              value: row.revenue,
              color: TERMS_COLORS[row.key as OrderTerms],
            }))}
          />
        </Card>
      </div>

      <Card
        flush
        title="Fulfillment ledger"
        subtitle={`${formatNumber(ledger.length)} delivered orders on the selected dates`}
        action={
          <button
            type="button"
            onClick={exportCsv}
            disabled={ledger.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="download" className="h-4 w-4" />
            Export CSV
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Delivered</th>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Terms</th>
                <th className="px-4 py-3">Paid via</th>
                <th className="px-4 py-3 text-right">Sales</th>
                <th className="px-4 py-3 text-right">Top-up</th>
                <th className="px-5 py-3 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
                    No delivered orders on these dates.
                  </td>
                </tr>
              ) : (
                ledger.slice(0, limit).map((order) => {
                  const total = orderTotal(order);
                  const topUp = orderTopUp(order);
                  return (
                    <tr key={order.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-700">
                        {formatDate(order.deliveredAt!.slice(0, 10))}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{order.id}</td>
                      <td className="px-4 py-3">{merchantName(order.merchantId)}</td>
                      <td className="px-4 py-3">{order.terms}</td>
                      <td className="px-4 py-3">{order.paymentMethod}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(total)}</td>
                      <td className="px-4 py-3 text-right text-violet-700">{formatCurrency(topUp)}</td>
                      <td className="px-5 py-3 text-right font-medium">{formatCurrency(total - topUp)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {ledger.length > limit ? (
          <div className="border-t border-slate-100 p-3 text-center">
            <button
              type="button"
              onClick={() => setLimit((current) => current + LEDGER_PAGE)}
              className="rounded-xl border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Show more ({formatNumber(ledger.length - limit)} left)
            </button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

type AccountingTab = 'reports' | 'costing';

export function AccountingView() {
  const [tab, setTab] = useState<AccountingTab>('reports');
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Accounting sections" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {([
          ['reports', 'Reports'],
          ['costing', 'Costing (restricted)'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
              tab === key ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'reports' ? (
        <AccountingReports />
      ) : (
        <div className="space-y-6">
          <PageHeader title="Costing" description="Pickup prices, collection fee and net COD per package. These numbers decide what merchants are paid." />
          <CostingView />
        </div>
      )}
    </div>
  );
}
