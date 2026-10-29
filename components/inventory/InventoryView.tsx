'use client';

import { useMemo, useState } from 'react';
import { ExpiryBadge } from '@/components/inventory/ExpiryBadge';
import { ReceivingPanel } from '@/components/inventory/ReceivingPanel';
import { RtsPanel } from '@/components/inventory/RtsPanel';
import { StockBadge } from '@/components/inventory/StockBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { COVER_WARNING_DAYS } from '@/lib/brand';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { coverDays, getExpiry, getStockStatus, recentUnitsByItem } from '@/lib/inventory';
import { availableOf, flattenDelivered, inTransitByItem, reservedByItem } from '@/lib/orders';
import { isSdsiTeam } from '@/lib/roles';
import { useAppData } from '@/lib/store';
import { CATEGORY_COLORS } from '@/lib/theme';
import { CATEGORIES, type Category } from '@/lib/types';
import { useToday } from '@/lib/use-today';

export function InventoryView() {
  const { user } = useAuth();
  const { items, orders, receipts, merchants } = useAppData();
  const today = useToday();

  const isMerchant = user?.role === 'merchant';
  const isStaff = isSdsiTeam(user?.role ?? 'merchant');
  const [tab, setTab] = useState<'stock' | 'receiving' | 'rts'>('stock');
  const showCost = user?.role !== 'cashier';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [merchantId, setMerchantId] = useState('all');
  const [alertsOnly, setAlertsOnly] = useState(false);

  const scopedItems = useMemo(() => {
    if (!user) return [];
    if (user.role === 'merchant') return items.filter((item) => item.merchantId === user.merchantId);
    return merchantId === 'all' ? items : items.filter((item) => item.merchantId === merchantId);
  }, [items, user, merchantId]);

  const reserved = useMemo(() => reservedByItem(orders), [orders]);
  const inTransit = useMemo(() => inTransitByItem(orders), [orders]);
  const recentUnits = useMemo(
    () => (today ? recentUnitsByItem(flattenDelivered(orders), today) : new Map<string, number>()),
    [orders, today],
  );

  const stats = useMemo(() => {
    let costValue = 0;
    let retailValue = 0;
    let units = 0;
    let stockAlerts = 0;
    let expiring = 0;
    for (const item of scopedItems) {
      costValue += item.stock * item.unitCost;
      retailValue += item.stock * item.unitPrice;
      units += item.stock;
      if (getStockStatus(item) !== 'ok') stockAlerts += 1;
      if (today && getExpiry(item, today).status !== 'ok') expiring += 1;
    }
    return { costValue, retailValue, units, stockAlerts, expiring };
  }, [scopedItems, today]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopedItems.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (alertsOnly && getStockStatus(item) === 'ok') return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
    });
  }, [scopedItems, query, category, alertsOnly]);

  if (!user) return null;

  const colCount = 9 + (showCost ? 1 : 0);

  const scopedOrders = orders.filter((o) => (isMerchant ? o.merchantId === user.merchantId : merchantId === 'all' || o.merchantId === merchantId));
  const scopedReceipts = receipts.filter((r) => (isMerchant ? r.merchantId === user.merchantId : merchantId === 'all' || r.merchantId === merchantId));
  const tabs = [
    { key: 'stock' as const, label: 'Stock', count: 0 },
    { key: 'receiving' as const, label: 'Receiving', count: scopedReceipts.filter((r) => r.status === 'pending').length },
    { key: 'rts' as const, label: 'RTS', count: scopedOrders.filter((o) => o.status === 'rts' && !o.returnReceiptId).length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={
          isMerchant
            ? 'Your running stock. On hand drops when the cashier marks an order delivered.'
            : 'Running stock per merchant. The cashier receives deliveries and returns; the admin or inventory clerk approves them.'
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Inventory section" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {tabs.map((option) => {
            const active = tab === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(option.key)}
                className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  active ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {option.label}
                {option.count > 0 ? (
                  <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'}`}>
                    {option.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {isStaff ? (
          <label className="text-xs font-medium text-slate-500">
            <span className="sr-only">Filter by merchant</span>
            <select
              value={merchantId}
              onChange={(event) => setMerchantId(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="all">All merchants</option>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {tab === 'receiving' ? <ReceivingPanel merchantFilter={isMerchant ? 'all' : merchantId} /> : null}
      {tab === 'rts' ? <RtsPanel merchantFilter={isMerchant ? 'all' : merchantId} /> : null}

      {tab === 'stock' ? (
      <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {showCost ? (
          <StatCard
            variant="primary"
            icon="inventory"
            label="Stock value (at cost)"
            value={formatCurrency(stats.costValue)}
            hint={`${formatCurrency(stats.retailValue)} at selling price`}
          />
        ) : (
          <StatCard
            variant="primary"
            icon="inventory"
            label="Units on hand"
            value={formatNumber(stats.units)}
            hint={`${formatCurrency(stats.retailValue)} at selling price`}
          />
        )}
        <StatCard
          icon="leaf"
          label="Products"
          value={formatNumber(scopedItems.length)}
          hint={`${formatNumber(stats.units)} units on hand`}
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
        title="Running inventory"
        subtitle={`On hand = physically in the warehouse. Reserved = promised to pending or packed orders. In transit = shipped, not yet paid. Available = what can still be ordered. Days of cover = how long it lasts at the last 30 days' pace (alert under ${COVER_WARNING_DAYS}).`}
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
                className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-52"
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
                <th className="px-4 py-3 text-right">On hand</th>
                <th className="px-4 py-3 text-right">Reserved</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-4 py-3 text-right" title="Shipped to customers, payment not collected yet">
                  In transit
                </th>
                {showCost ? <th className="px-4 py-3 text-right">Unit cost</th> : null}
                <th className="px-4 py-3 text-right">Unit price</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Days of cover</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-5 py-10 text-center text-slate-500">
                    No products match your filters.
                  </td>
                </tr>
              ) : (
                rows.map((item) => {
                  const status = getStockStatus(item);
                  const held = reserved.get(item.id) ?? 0;
                  const available = availableOf(item, reserved);
                  const expiry = today ? getExpiry(item, today) : null;
                  const cover = today ? coverDays(item.stock, recentUnits.get(item.id) ?? 0) : null;
                  const coverTone =
                    cover === null
                      ? 'text-slate-400'
                      : cover < 14
                        ? 'font-semibold text-rose-600'
                        : cover < COVER_WARNING_DAYS
                          ? 'font-semibold text-amber-700'
                          : 'text-slate-700';
                  const merchant = merchants.find((m) => m.id === item.merchantId);

                  return (
                    <tr key={item.id} className={status === 'ok' ? '' : 'bg-amber-50/40'}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="font-mono">{item.sku}</span>
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: CATEGORY_COLORS[item.category] }}
                            />
                            {item.category}
                          </span>
                          {isStaff && merchant ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                              {merchant.name}
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold">{formatNumber(item.stock)}</td>
                      <td className="px-4 py-4 text-right text-slate-600">
                        {held > 0 ? formatNumber(held) : '—'}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-emerald-700">
                        {formatNumber(available)}
                      </td>
                      <td className="px-4 py-4 text-right text-violet-700">
                        {(inTransit.get(item.id) ?? 0) > 0 ? formatNumber(inTransit.get(item.id) ?? 0) : '—'}
                      </td>
                      {showCost ? (
                        <td className="px-4 py-4 text-right">{formatCurrency(item.unitCost)}</td>
                      ) : null}
                      <td className="px-4 py-4 text-right">{formatCurrency(item.unitPrice)}</td>
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Low Stock means on hand is at or below the product&apos;s reorder level. Days of cover in red
          is under 14 days, amber is under {COVER_WARNING_DAYS}.
        </p>
      </Card>
      </>
      ) : null}
    </div>
  );
}
