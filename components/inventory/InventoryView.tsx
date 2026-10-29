'use client';

import { useMemo, useState } from 'react';
import { ExpiryBadge } from '@/components/inventory/ExpiryBadge';
import { StockBadge } from '@/components/inventory/StockBadge';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { SUPPLIER_LEAD_TIME_DAYS } from '@/lib/brand';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { coverDays, getExpiry, getStockStatus, recentUnitsByItem } from '@/lib/inventory';
import { useMerchant } from '@/lib/store';
import { CATEGORY_COLORS } from '@/lib/theme';
import { CATEGORIES, type Category } from '@/lib/types';
import { useToday } from '@/lib/use-today';

const RESTOCK_QTY = 10;

export function InventoryView() {
  const { items, sales, restock } = useMerchant();
  const today = useToday();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [alertsOnly, setAlertsOnly] = useState(false);

  const recentUnits = useMemo(
    () => (today ? recentUnitsByItem(sales, today) : new Map<string, number>()),
    [sales, today],
  );

  const stats = useMemo(() => {
    let costValue = 0;
    let retailValue = 0;
    let stockAlerts = 0;
    let expiring = 0;
    for (const item of items) {
      costValue += item.stock * item.unitCost;
      retailValue += item.stock * item.unitPrice;
      if (getStockStatus(item) !== 'ok') stockAlerts += 1;
      if (today && getExpiry(item, today).status !== 'ok') expiring += 1;
    }
    return { costValue, retailValue, stockAlerts, expiring };
  }, [items, today]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (alertsOnly && getStockStatus(item) === 'ok') return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
    });
  }, [items, query, category, alertsOnly]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="inventory"
          label="Stock value (at cost)"
          value={formatCurrency(stats.costValue)}
          hint={`${formatCurrency(stats.retailValue)} at selling price`}
        />
        <StatCard
          icon="leaf"
          label="Products"
          value={formatNumber(items.length)}
          hint={`${formatNumber(items.reduce((sum, item) => sum + item.stock, 0))} units on hand`}
        />
        <StatCard
          icon="alert"
          label="Low / out of stock"
          value={formatNumber(stats.stockAlerts)}
          hint={stats.stockAlerts > 0 ? 'Needs restocking' : 'All items healthy'}
        />
        <StatCard
          icon="clock"
          label="Expiring soon"
          value={today ? formatNumber(stats.expiring) : '—'}
          hint="Within 90 days or already expired"
        />
      </div>

      <Card
        flush
        title="Stock levels"
        subtitle={`Days of cover = how long stock lasts at the last 30 days' sales pace. Supplier lead time is about ${SUPPLIER_LEAD_TIME_DAYS} days.`}
        action={
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block">
              <span className="sr-only">Search inventory</span>
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search product or SKU"
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-56"
              />
            </label>
            <label>
              <span className="sr-only">Filter by category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as Category | 'all')}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="all">All categories</option>
                {CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-600">
              <input
                type="checkbox"
                checked={alertsOnly}
                onChange={(event) => setAlertsOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-300"
              />
              Alerts only
            </label>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Product</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right" title="Days the current stock lasts at the recent sales pace">
                  Days of cover
                </th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-slate-500">
                    No products match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const status = getStockStatus(item);
                  const margin =
                    item.unitPrice > 0 ? ((item.unitPrice - item.unitCost) / item.unitPrice) * 100 : 0;
                  const fill = Math.min(100, (item.stock / (item.reorderLevel * 3)) * 100);
                  const barColor =
                    status === 'ok' ? 'bg-emerald-500' : status === 'low' ? 'bg-amber-500' : 'bg-rose-500';
                  const expiry = today ? getExpiry(item, today) : null;
                  const cover = today ? coverDays(item.stock, recentUnits.get(item.id) ?? 0) : null;
                  const coverTone =
                    cover === null
                      ? 'text-slate-400'
                      : cover < 45
                        ? 'font-semibold text-rose-600'
                        : cover < SUPPLIER_LEAD_TIME_DAYS
                          ? 'font-semibold text-amber-700'
                          : 'text-slate-700';

                  return (
                    <tr key={item.id} className={status === 'ok' ? '' : 'bg-amber-50/40'}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono">{item.sku}</span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: CATEGORY_COLORS[item.category] }}
                            />
                            {item.category}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="font-semibold">{formatNumber(item.stock)}</span>
                          <span
                            className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"
                            role="img"
                            aria-label={`Stock level ${Math.round(fill)}%`}
                          >
                            <span
                              className={`block h-full rounded-full ${barColor}`}
                              style={{ width: `${fill}%` }}
                            />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">{formatCurrency(item.unitCost)}</td>
                      <td className="px-4 py-4 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-4 text-right text-slate-600">{margin.toFixed(1)}%</td>
                      <td className="px-4 py-4">
                        <p className="whitespace-nowrap text-slate-700">{formatDate(item.expiryDate)}</p>
                        {expiry ? (
                          <div className="mt-1">
                            <ExpiryBadge status={expiry.status} daysLeft={expiry.daysLeft} />
                          </div>
                        ) : null}
                      </td>
                      <td className={`px-4 py-4 text-right ${coverTone}`}>
                        {cover === null ? '—' : `${formatNumber(cover)}d`}
                      </td>
                      <td className="px-4 py-4">
                        <StockBadge status={status} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => restock(item.id, RESTOCK_QTY)}
                          className="whitespace-nowrap rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Restock +{RESTOCK_QTY}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Low Stock means quantity is at or below the product&apos;s reorder level. Days of cover in red
          is under 45 days, amber is under the {SUPPLIER_LEAD_TIME_DAYS}-day supplier lead time.
        </p>
      </Card>
    </div>
  );
}
