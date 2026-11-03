'use client';

import { useMemo, useState } from 'react';
import { ExpiryBadge } from '@/components/inventory/ExpiryBadge';
import { MasterListPanel } from '@/components/inventory/MasterListPanel';
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
import { coverDays, describeParts, getExpiry, getStockStatus, stockAt } from '@/lib/inventory';
import { addDays } from '@/lib/period';
import { inTransitUnits, makeStockBook, recentUnitsByUnit, reservedUnits, stockUnits } from '@/lib/stock';
import { availableOf, flattenDelivered } from '@/lib/orders';
import { isSdsiTeam } from '@/lib/roles';
import { useAppData } from '@/lib/store';
import { CATEGORY_COLORS } from '@/lib/theme';
import { BRANCHES, DEFAULT_BRANCH, type BranchId } from '@/lib/types';
import { useToday } from '@/lib/use-today';

export function InventoryView() {
  const { user } = useAuth();
  const { items: skus, orders, receipts, merchants, products } = useAppData();
  // Stock is counted per product from the master list (plus any older SKU that keeps its own stock).
  const items = useMemo(() => stockUnits(skus, products), [skus, products]);
  const today = useToday();

  const isMerchant = user?.role === 'merchant';
  const isStaff = isSdsiTeam(user?.role ?? 'merchant');
  const [tab, setTab] = useState<'stock' | 'receiving' | 'rts' | 'master'>('stock');

  const [query, setQuery] = useState('');
  const [merchantId, setMerchantId] = useState('all');
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [branchView, setBranchView] = useState<BranchId | 'all' | null>(null);
  // A cashier starts on their own branch; everyone else on the total.
  const branchSel: BranchId | 'all' = branchView ?? (user?.role === 'cashier' ? (user.branchId ?? DEFAULT_BRANCH) : 'all');

  const scopedItems = useMemo(() => {
    if (!user) return [];
    const mine =
      user.role === 'merchant'
        ? items.filter((item) => item.merchantId === user.merchantId)
        : merchantId === 'all'
          ? items
          : items.filter((item) => item.merchantId === merchantId);
    // On one branch's page the stock shown is that branch's shelf.
    return branchSel === 'all' ? mine : mine.map((item) => ({ ...item, stock: stockAt(item, branchSel) }));
  }, [items, user, merchantId, branchSel]);

  const reserved = useMemo(() => reservedUnits(orders, skus, branchSel === 'all' ? undefined : branchSel), [orders, skus, branchSel]);
  const inTransit = useMemo(() => inTransitUnits(orders, skus), [orders, skus]);
  const recentUnits = useMemo(
    () => (today ? recentUnitsByUnit(flattenDelivered(orders), skus, today, 30, addDays) : new Map<string, number>()),
    [orders, skus, today],
  );

  const stats = useMemo(() => {
    let retailValue = 0;
    let units = 0;
    let stockAlerts = 0;
    let expiring = 0;
    for (const item of scopedItems) {
      retailValue += item.stock * item.unitPrice;
      units += item.stock;
      if (getStockStatus(item) !== 'ok') stockAlerts += 1;
      if (today && getExpiry(item, today).status !== 'ok') expiring += 1;
    }
    return { retailValue, units, stockAlerts, expiring };
  }, [scopedItems, today]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return scopedItems.filter((item) => {
      if (alertsOnly && getStockStatus(item) === 'ok') return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
    });
  }, [scopedItems, query, alertsOnly]);

  if (!user) return null;

  const colCount = 9;

  const scopedOrders = orders.filter((o) => (isMerchant ? o.merchantId === user.merchantId : merchantId === 'all' || o.merchantId === merchantId));
  const scopedReceipts = receipts.filter((r) => (isMerchant ? r.merchantId === user.merchantId : merchantId === 'all' || r.merchantId === merchantId));
  const tabs = [
    { key: 'stock' as const, label: 'Stock', count: 0 },
    { key: 'receiving' as const, label: 'Stock in / out', count: scopedReceipts.filter((r) => r.status === 'pending').length },
    { key: 'rts' as const, label: 'RTS', count: scopedOrders.filter((o) => o.status === 'rts' && !o.returnReceiptId).length },
    { key: 'master' as const, label: 'Master list', count: 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description={
          isMerchant
            ? 'Your running stock. On hand drops when the cashier marks an order delivered.'
            : 'Running stock per merchant. Stock in and out: the cashier records, the admin or inventory clerk approves. The clerk and admin post directly.'
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
                  active ? 'bg-emerald-600 text-emerald-950 shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
        <label className="text-xs font-medium text-slate-500">
          <span className="sr-only">Branch</span>
          <select
            aria-label="Branch"
            value={branchSel}
            onChange={(event) => setBranchView(event.target.value as BranchId | 'all')}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
          >
            <option value="all">All branches</option>
            {BRANCHES.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
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
      {tab === 'master' ? <MasterListPanel merchantFilter={isMerchant ? 'all' : merchantId} /> : null}
      {tab === 'rts' ? <RtsPanel merchantFilter={isMerchant ? 'all' : merchantId} /> : null}

      {tab === 'stock' ? (
      <>
      {!isMerchant ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('receiving')}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500"
          >
            + Stock in
          </button>
          <button
            type="button"
            onClick={() => setTab('receiving')}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            − Stock out
          </button>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="inventory"
          label="Stock value (at SRP)"
          value={formatCurrency(stats.retailValue)}
          hint={`${formatNumber(stats.units)} units on hand`}
        />
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
                        {item.parts?.length ? <p className="mt-0.5 text-xs text-slate-500">Contains: {describeParts(item, products)}</p> : null}
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="font-mono">{item.sku}</span>
                          {item.id.startsWith('prd-') ? null : (
                            <span className="inline-flex items-center gap-1">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ background: CATEGORY_COLORS[item.category] }}
                              />
                              {item.category}
                            </span>
                          )}
                          {isStaff && merchant ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                              {merchant.name}
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-right font-semibold">
                        {formatNumber(item.stock)}
                        {branchSel === 'all' ? (
                          <span className="block text-xs font-normal text-slate-500">
                            {BRANCHES.map((branch) => `${branch.id === DEFAULT_BRANCH ? 'Sheung Wan' : branch.name} ${formatNumber(stockAt(item, branch.id))}`).join(' · ')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-4 text-right text-slate-600">
                        {held > 0 ? formatNumber(held) : '—'}
                      </td>
                      <td className="px-4 py-4 text-right font-semibold text-emerald-700">
                        {formatNumber(available)}
                      </td>
                      <td className="px-4 py-4 text-right text-violet-700">
                        {(inTransit.get(item.id) ?? 0) > 0 ? formatNumber(inTransit.get(item.id) ?? 0) : '—'}
                      </td>
                      <td className="px-4 py-4 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-4 py-4">
                        <p className="whitespace-nowrap text-slate-700">{item.expiryDate >= '2099' ? <span className="text-slate-400">—</span> : formatDate(item.expiryDate)}</p>
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
      <SellableSkus merchantId={isMerchant ? 'all' : merchantId} branch={branchSel} />
      </>
      ) : null}
    </div>
  );
}

/** How many of each SKU or bundle can be sold right now, worked out from the product stock inside it. */
function SellableSkus({ merchantId, branch }: { merchantId: string; branch: BranchId | 'all' }) {
  const { items, products, orders, merchants } = useAppData();
  const book = useMemo(() => makeStockBook(items, products, orders), [items, products, orders]);
  const rows = items.filter((item) => item.parts?.length && !item.disabled && (merchantId === 'all' || item.merchantId === merchantId));
  if (rows.length === 0) return null;
  const at = branch === 'all' ? undefined : branch;
  return (
    <Card flush title="SKUs you can sell" subtitle="A SKU has no stock of its own: it is as many as the products inside allow, after open orders. Stock in and out is recorded on the products above.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Made of</th>
              <th className="px-3 py-2.5 text-right">Can sell</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr key={item.id} data-testid="sellable-row">
                <td className="px-5 py-3 font-mono text-xs text-slate-600">{item.sku}</td>
                <td className="px-3 py-3 font-medium text-slate-900">
                  {item.name}
                  <span className="block text-xs font-normal text-slate-500">{merchants.find((m) => m.id === item.merchantId)?.name}</span>
                </td>
                <td className="px-3 py-3 text-xs text-slate-600">{describeParts(item, products)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatNumber(book.available(item, at))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
