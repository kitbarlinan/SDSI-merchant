'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { StockBadge } from '@/components/inventory/StockBadge';
import { formatCurrency, formatNumber } from '@/lib/format';
import { getStockStatus } from '@/lib/inventory';
import { useMerchant } from '@/lib/store';

const RESTOCK_QTY = 10;

export function InventoryView() {
  const { items, restock } = useMerchant();
  const [query, setQuery] = useState('');
  const [alertsOnly, setAlertsOnly] = useState(false);

  const stats = useMemo(() => {
    let units = 0;
    let costValue = 0;
    let alerts = 0;
    for (const item of items) {
      units += item.stock;
      costValue += item.stock * item.unitCost;
      if (getStockStatus(item) !== 'ok') alerts += 1;
    }
    return { skus: items.length, units, costValue, alerts };
  }, [items]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (alertsOnly && getStockStatus(item) === 'ok') return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
    });
  }, [items, query, alertsOnly]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Products (SKUs)" value={formatNumber(stats.skus)} />
        <StatCard label="Units on hand" value={formatNumber(stats.units)} />
        <StatCard label="Stock value (at cost)" value={formatCurrency(stats.costValue)} />
        <StatCard
          label="Low-stock alerts"
          value={formatNumber(stats.alerts)}
          accent={stats.alerts > 0 ? 'amber' : 'emerald'}
          hint={stats.alerts > 0 ? 'Needs restocking soon' : 'All items healthy'}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold">Stock levels</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                placeholder="Search item or SKU"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-64"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={alertsOnly}
                onChange={(event) => setAlertsOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
              />
              Alerts only
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-3">Item</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-6 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                    No items match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const status = getStockStatus(item);
                  const margin =
                    item.unitPrice > 0
                      ? ((item.unitPrice - item.unitCost) / item.unitPrice) * 100
                      : 0;
                  const fill = Math.min(100, (item.stock / (item.reorderLevel * 3)) * 100);
                  const barColor =
                    status === 'ok' ? 'bg-emerald-500' : status === 'low' ? 'bg-amber-500' : 'bg-rose-500';

                  return (
                    <tr key={item.id} className={status === 'ok' ? '' : 'bg-amber-50/40'}>
                      <td className="px-6 py-4 font-medium text-slate-900">{item.name}</td>
                      <td className="px-4 py-4 font-mono text-xs text-slate-500">{item.sku}</td>
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
                        <StockBadge status={status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => restock(item.id, RESTOCK_QTY)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
        <p className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500">
          An item is flagged as Low Stock when its quantity is at or below its reorder level.
        </p>
      </section>
    </div>
  );
}
