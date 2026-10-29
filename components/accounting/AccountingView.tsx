'use client';

import { useMemo, useState } from 'react';
import { DonutChart } from '@/components/charts/DonutChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { PeriodTabs } from '@/components/ui/PeriodTabs';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatNumber, formatPercent } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { flattenDelivered, orderTopUp, orderTotal } from '@/lib/orders';
import { currentRange, previousRange, type PeriodKey } from '@/lib/period';
import { buildTrend, filterByRange, groupSales, pctChange, summarize } from '@/lib/reports';
import { useAppData } from '@/lib/store';
import { PAYMENT_COLORS, TERMS_COLORS } from '@/lib/theme';
import type { OrderTerms, PaymentMethod } from '@/lib/types';
import { useToday } from '@/lib/use-today';

const LEDGER_PAGE = 25;

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function AccountingView() {
  const { user } = useAuth();
  const { orders, merchants, topUpPercent, setTopUpPercent } = useAppData();
  const today = useToday();
  const asOf = today || MOCK_TODAY;

  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [rateInput, setRateInput] = useState('');
  const [rateError, setRateError] = useState<string | null>(null);
  const [rateSaved, setRateSaved] = useState(false);
  const [limit, setLimit] = useState(LEDGER_PAGE);

  const sales = useMemo(() => flattenDelivered(orders), [orders]);
  const range = currentRange(period, asOf);
  const prevRange = previousRange(period, asOf);

  const current = useMemo(() => filterByRange(sales, range), [sales, range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = summarize(current);
  const prev = prevRange ? summarize(filterByRange(sales, prevRange)) : null;

  const trend = useMemo(
    () =>
      buildTrend(
        current,
        range.start ?? current.reduce((min, line) => (line.date < min ? line.date : min), asOf),
        range.end,
      ),
    [current, range.start, range.end, asOf],
  );

  const byMerchant = useMemo(() => groupSales(current, (line) => line.merchantId), [current]);
  const byPayment = useMemo(() => groupSales(current, (line) => line.paymentMethod), [current]);
  const byTerms = useMemo(() => groupSales(current, (line) => line.terms), [current]);

  const ledger = useMemo(
    () =>
      orders
        .filter((order) => {
          if (order.status !== 'delivered' || !order.deliveredAt) return false;
          const day = order.deliveredAt.slice(0, 10);
          return (range.start === null || day >= range.start) && day <= range.end;
        })
        .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? '')),
    [orders, range.start, range.end],
  );

  if (!user) return null;
  const actor = user;
  const merchantName = (id: string) => merchants.find((m) => m.id === id)?.name ?? id;

  function saveRate() {
    const result = setTopUpPercent(actor, Number(rateInput));
    if (!result.ok) {
      setRateError(result.error);
      setRateSaved(false);
      return;
    }
    setRateError(null);
    setRateSaved(true);
    setRateInput('');
  }

  function exportCsv() {
    const header = [
      'Delivered',
      'Order',
      'Merchant',
      'Customer',
      'Terms',
      'Paid via',
      'Merchant sales',
      'Top-up rate %',
      'SDSI top-up',
      'Net payable to merchant',
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
        (total - topUp).toFixed(2),
      ]
        .map(csvCell)
        .join(',');
    });
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sdsi-fulfillment-ledger-${period}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounting"
        description="SDSI's real revenue as the fulfillment party. Merchant sales are shown as pass-through, not SDSI sales."
        actions={<PeriodTabs value={period} onChange={(next) => { setPeriod(next); setLimit(LEDGER_PAGE); }} />}
      />

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
        <p className="font-medium">How the numbers work</p>
        <p className="mt-1 text-violet-800">
          SDSI fulfills orders for the merchants, so the cash we collect belongs to them. SDSI&apos;s own
          revenue is only the <strong>top-up</strong> on each delivered order. Net payable is what SDSI
          owes the merchant: sales minus top-up.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="wallet"
          label="SDSI revenue (top-up)"
          value={formatCurrency(summary.topUp)}
          hint={`${formatPercent(topUpPercent)} placeholder rate`}
          delta={prev ? pctChange(summary.topUp, prev.topUp) : undefined}
        />
        <StatCard
          icon="truck"
          label="Orders fulfilled"
          value={formatNumber(summary.orders)}
          hint={`${formatNumber(summary.units)} units delivered`}
          delta={prev ? pctChange(summary.orders, prev.orders) : undefined}
        />
        <StatCard
          icon="orders"
          label="Merchant sales handled"
          value={formatCurrency(summary.revenue)}
          hint="Pass-through, not SDSI revenue"
          delta={prev ? pctChange(summary.revenue, prev.revenue) : undefined}
        />
        <StatCard
          icon="leaf"
          label="Net payable to merchants"
          value={formatCurrency(summary.netPayable)}
          hint="Sales minus top-up"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="SDSI top-up over time" subtitle="Revenue earned by SDSI per day">
          <TrendChart data={trend} primary="topUp" />
        </Card>

        <Card
          title="Top-up rate"
          subtitle="Still to be finalized"
          action={<Badge tone="amber">Placeholder</Badge>}
        >
          <div className="space-y-3">
            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {formatPercent(topUpPercent)}
            </p>
            <p className="text-xs text-slate-500">
              Each order keeps the rate it was delivered with, so changing this only affects orders
              delivered from now on.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step="0.1"
                inputMode="decimal"
                value={rateInput}
                onChange={(event) => {
                  setRateInput(event.target.value);
                  setRateSaved(false);
                }}
                onKeyDown={(event) => event.key === 'Enter' && saveRate()}
                aria-label="New top-up percent"
                placeholder="New %"
                className={inputClass(Boolean(rateError))}
              />
              <button
                type="button"
                onClick={saveRate}
                disabled={rateInput.trim() === ''}
                className="rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {rateError ? (
              <p role="alert" className="text-xs text-rose-600">
                {rateError}
              </p>
            ) : null}
            {rateSaved ? <p className="text-xs text-emerald-700">Saved for new deliveries.</p> : null}
          </div>
        </Card>
      </div>

      <Card
        flush
        title="Merchant statement"
        subtitle="What each merchant sold, what SDSI earned, and what is owed to them"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Merchant</th>
                <th className="px-4 py-3 text-right">Orders</th>
                <th className="px-4 py-3 text-right">Merchant sales</th>
                <th className="px-4 py-3 text-right">SDSI top-up</th>
                <th className="px-5 py-3 text-right">Net payable</th>
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
                    <td className="px-5 py-3.5 text-right font-semibold">{formatCurrency(sold - topUp)}</td>
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
        subtitle={`${formatNumber(ledger.length)} delivered orders in this period`}
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
                    No delivered orders in this period.
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
