'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/format';
import { orderNet, orderTopUp, orderTotal } from '@/lib/orders';
import type { DayRange } from '@/lib/period';
import { useAppData } from '@/lib/store';

interface Day {
  date: string;
  orders: number;
  srp: number;
  topUp: number;
  reseller: number;
  referrer: number;
  tier: number;
  fees: number;
  merchantNet: number;
}

const cell = 'px-3 py-2 text-right tabular-nums';

/** Net income per day of the delivered orders: Yellow Basket's top-up, and what is charged to the merchants. */
export function NetIncomeCard({ merchantId, range, today, setRange }: { merchantId: string; range: DayRange; today: string; setRange: (range: DayRange) => void }) {
  const { orders, merchants } = useAppData();

  const { days, total } = useMemo(() => {
    const byDay = new Map<string, Day>();
    for (const order of orders) {
      if (order.status !== 'delivered' || !order.deliveredAt) continue;
      if (merchantId !== 'all' && order.merchantId !== merchantId) continue;
      const date = order.deliveredAt.slice(0, 10);
      if (date < range.start || date > range.end) continue;
      const d = byDay.get(date) ?? { date, orders: 0, srp: 0, topUp: 0, reseller: 0, referrer: 0, tier: 0, fees: 0, merchantNet: 0 };
      d.orders += 1;
      d.srp += orderTotal(order);
      d.topUp += orderTopUp(order);
      d.reseller += order.deductions?.resellerPhp ?? 0;
      d.referrer += order.deductions?.referrerPhp ?? 0;
      d.tier += order.deductions?.tierPhp ?? 0;
      d.fees += order.deductions?.systemFeePhp ?? 0;
      d.merchantNet += orderNet(order);
      byDay.set(date, d);
    }
    const days = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
    const total = days.reduce<Day>(
      (t, d) => ({ date: 'Total', orders: t.orders + d.orders, srp: t.srp + d.srp, topUp: t.topUp + d.topUp, reseller: t.reseller + d.reseller, referrer: t.referrer + d.referrer, tier: t.tier + d.tier, fees: t.fees + d.fees, merchantNet: t.merchantNet + d.merchantNet }),
      { date: 'Total', orders: 0, srp: 0, topUp: 0, reseller: 0, referrer: 0, tier: 0, fees: 0, merchantNet: 0 },
    );
    return { days, total };
  }, [orders, merchantId, range.start, range.end]);

  const merchantName = merchantId === 'all' ? 'All merchants' : merchants.find((m) => m.id === merchantId)?.name ?? merchantId;
  const thisMonth = () => setRange({ start: `${today.slice(0, 8)}01`, end: today });

  return (
    <Card
      title="Net income"
      subtitle={`${merchantName} · ${formatDate(range.start)} to ${formatDate(range.end)}. Per day, delivered orders only. Uses the merchant and date filters above.`}
      action={
        <button type="button" onClick={thisMonth} className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          This month
        </button>
      }
    >
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="text-xs text-slate-600">Yellow Basket top-up (income)</p>
          <p className="text-xl font-semibold text-emerald-800">{formatCurrency(total.topUp)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-600">Charged to merchants (reseller program)</p>
          <p className="text-xl font-semibold text-slate-800">{formatCurrency(total.reseller + total.referrer + total.tier + total.fees)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-xs text-slate-600">Net remittance to merchants</p>
          <p className="text-xl font-semibold text-slate-800">{formatCurrency(total.merchantNet)}</p>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-right">Orders</th>
              <th className="px-3 py-2 text-right">Net SRP (PHP)</th>
              <th className="bg-yellow-50 px-3 py-2 text-right">Yellow Basket top-up</th>
              <th className="px-3 py-2 text-right">Reseller discount</th>
              <th className="px-3 py-2 text-right">Referrer</th>
              <th className="px-3 py-2 text-right">Tier (1-2)</th>
              <th className="px-3 py-2 text-right">System fees</th>
              <th className="px-3 py-2 text-right">Net remittance to merchant</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {days.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No delivered orders in this range.</td></tr>
            ) : (
              [...days, total].map((d) => (
                <tr key={d.date} className={d.date === 'Total' ? 'bg-slate-50 font-semibold' : ''}>
                  <td className="whitespace-nowrap px-3 py-2">{d.date === 'Total' ? 'Total' : formatDate(d.date)}</td>
                  <td className={cell}>{d.orders}</td>
                  <td className={cell}>{formatCurrency(d.srp)}</td>
                  <td className={`${cell} bg-yellow-50/60 font-semibold text-emerald-700`}>{formatCurrency(d.topUp)}</td>
                  <td className={cell}>{formatCurrency(d.reseller)}</td>
                  <td className={cell}>{formatCurrency(d.referrer)}</td>
                  <td className={cell}>{formatCurrency(d.tier)}</td>
                  <td className={cell}>{formatCurrency(d.fees)}</td>
                  <td className={cell}>{formatCurrency(d.merchantNet)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
