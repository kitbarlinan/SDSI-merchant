'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AlertsPanel } from '@/components/dashboard/AlertsPanel';
import { BarList } from '@/components/charts/BarList';
import { TrendChart } from '@/components/charts/TrendChart';
import { StockBadge } from '@/components/inventory/StockBadge';
import { PageHeader } from '@/components/layout/PageHeader';
import { OrderStatusBadge, TermsBadge } from '@/components/orders/OrderBadges';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { DateFilter } from '@/components/ui/DateFilter';
import { MerchantFilter } from '@/components/ui/MerchantFilter';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateTime, formatHkd, formatNumber, formatPercent } from '@/lib/format';
import { getStockStatus } from '@/lib/inventory';
import {
  availableOf,
  flattenDelivered,
  isOpen,
  orderAmountLabel,
  toCollectHkd,
  reservedByItem,
  sortNewestFirst,
} from '@/lib/orders';
import { previousOf, trendWindow, type DayRange } from '@/lib/period';
import { buildTrend, filterByRange, groupSales, pctChange, summarize } from '@/lib/reports';
import { useAppData } from '@/lib/store';
import { useDayRange } from '@/lib/use-day-range';
import type { InventoryItem, Merchant, Order, SaleLine } from '@/lib/types';

function RecentOrders({
  orders,
  merchants,
  showMerchant,
}: {
  orders: Order[];
  merchants: Merchant[];
  showMerchant: boolean;
}) {
  const recent = useMemo(() => sortNewestFirst(orders).slice(0, 6), [orders]);
  return (
    <Card
      flush
      title="Recent orders"
      action={
        <Link href="/orders" className="text-xs font-medium text-emerald-700 hover:underline">
          View all
        </Link>
      }
    >
      {recent.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-slate-500">No orders yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recent.map((order) => {
            const merchant = merchants.find((m) => m.id === order.merchantId);
            return (
              <li key={order.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    <span className="font-mono">{order.id}</span>
                    <span className="font-normal text-slate-500">
                      {' '}
                      · {order.customerName ?? 'Walk-in'}
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {showMerchant && merchant ? `${merchant.name} · ` : ''}
                    {formatDateTime(order.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <TermsBadge terms={order.terms} />
                  <OrderStatusBadge status={order.status} />
                  <span className="w-20 text-right font-semibold text-slate-900">
                    {orderAmountLabel(order)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Per-merchant running inventory: on hand, reserved, available and value. */
function InventoryByMerchant({
  merchants,
  items,
  reserved,
}: {
  merchants: Merchant[];
  items: InventoryItem[];
  reserved: Map<string, number>;
}) {
  return (
    <Card
      flush
      title="Running inventory by merchant"
      subtitle="Live stock held in the SDSI warehouse"
      action={
        <Link href="/inventory" className="text-xs font-medium text-emerald-700 hover:underline">
          Open inventory
        </Link>
      }
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3">Merchant</th>
              <th className="px-4 py-3 text-right">Products</th>
              <th className="px-4 py-3 text-right">On hand</th>
              <th className="px-4 py-3 text-right">Reserved</th>
              <th className="px-4 py-3 text-right">Available</th>
              <th className="px-4 py-3 text-right">Value (SRP)</th>
              <th className="px-5 py-3 text-right">Alerts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {merchants.map((merchant) => {
              const own = items.filter((item) => item.merchantId === merchant.id);
              const onHand = own.reduce((sum, item) => sum + item.stock, 0);
              const held = own.reduce((sum, item) => sum + (reserved.get(item.id) ?? 0), 0);
              const available = own.reduce((sum, item) => sum + availableOf(item, reserved), 0);
              const value = own.reduce((sum, item) => sum + item.stock * item.unitPrice, 0);
              const alerts = own.filter((item) => getStockStatus(item) !== 'ok').length;
              return (
                <tr key={merchant.id}>
                  <td className="px-5 py-3.5 font-medium text-slate-900">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: merchant.color }} />
                      {merchant.name}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">{own.length}</td>
                  <td className="px-4 py-3.5 text-right font-semibold">{formatNumber(onHand)}</td>
                  <td className="px-4 py-3.5 text-right text-slate-600">{formatNumber(held)}</td>
                  <td className="px-4 py-3.5 text-right font-semibold text-emerald-700">
                    {formatNumber(available)}
                  </td>
                  <td className="px-4 py-3.5 text-right">{formatCurrency(value)}</td>
                  <td className="px-5 py-3.5 text-right">
                    {alerts > 0 ? <Badge tone="amber">{alerts}</Badge> : <Badge tone="green">OK</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminDashboard({
  range,
  merchantFilter,
  today,
}: {
  range: DayRange;
  merchantFilter: string;
  today: string;
}) {
  const { merchants: allMerchants, items: allItems, orders: allOrders } = useAppData();
  const merchants = useMemo(
    () => (merchantFilter === 'all' ? allMerchants : allMerchants.filter((m) => m.id === merchantFilter)),
    [allMerchants, merchantFilter],
  );
  const items = useMemo(
    () => (merchantFilter === 'all' ? allItems : allItems.filter((i) => i.merchantId === merchantFilter)),
    [allItems, merchantFilter],
  );
  const orders = useMemo(
    () => (merchantFilter === 'all' ? allOrders : allOrders.filter((o) => o.merchantId === merchantFilter)),
    [allOrders, merchantFilter],
  );
  const sales = useMemo(() => flattenDelivered(orders), [orders]);
  const reserved = useMemo(() => reservedByItem(orders), [orders]);

  const current = useMemo(() => filterByRange(sales, range), [sales, range]);
  const summary = summarize(current);
  const prev = summarize(filterByRange(sales, previousOf(range)));
  const window = trendWindow(range);
  const trend = useMemo(() => buildTrend(sales, window.start, window.end), [sales, window.start, window.end]);

  const byMerchant = useMemo(() => groupSales(current, (line) => line.merchantId), [current]);
  const openOrders = orders.filter(isOpen);
  const stockAlerts = items.filter((item) => getStockStatus(item) !== 'ok').length;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="wallet"
          label="Total merchant sales"
          value={formatCurrency(summary.revenue)}
          hint="Cash collected on delivered orders"
          delta={pctChange(summary.revenue, prev.revenue)}
        />
        <StatCard
          icon="truck"
          label="Transactions"
          value={formatNumber(summary.orders)}
          hint={`${formatNumber(summary.units)} units delivered`}
          delta={pctChange(summary.orders, prev.orders)}
        />
        <StatCard
          icon="orders"
          label="Open orders"
          value={formatNumber(openOrders.length)}
          hint={`${formatNumber(openOrders.filter((o) => o.status === 'pending').length)} to pack · ${formatNumber(openOrders.filter((o) => o.status === 'shipped').length)} on the road`}
        />
        <StatCard
          icon="alert"
          label="Stock alerts"
          value={formatNumber(stockAlerts)}
          hint="Low or out-of-stock products"
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Total sales per merchant</h2>
        <div className={`grid gap-4 ${merchants.length > 1 ? 'md:grid-cols-3' : 'md:max-w-md'}`}>
          {merchants.map((merchant) => {
            const row = byMerchant.find((r) => r.key === merchant.id);
            const own = items.filter((item) => item.merchantId === merchant.id);
            const units = own.reduce((sum, item) => sum + item.stock, 0);
            const open = openOrders.filter((o) => o.merchantId === merchant.id).length;
            return (
              <div
                key={merchant.id}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
                style={{ borderTop: `3px solid ${merchant.color}` }}
              >
                <p className="text-sm font-semibold text-slate-900">{merchant.name}</p>
                <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
                  {formatCurrency(row?.revenue ?? 0)}
                </p>
                <p className="text-xs text-slate-500">
                  {formatNumber(row?.orders ?? 0)} transactions · {formatPercent(row?.share ?? 0)} of all
                  sales
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Stock on hand</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                      {formatNumber(units)} units
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Open orders</dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-900">{open}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Sales trend"
          subtitle={window.padded ? 'Last 14 days, for context' : 'Selected dates'}
        >
          <TrendChart data={trend} primary="revenue" />
        </Card>
        <Card title="Sales by merchant" subtitle="Selected dates">
          <BarList
            items={merchants
              .map((merchant) => {
                const row = byMerchant.find((r) => r.key === merchant.id);
                return {
                  key: merchant.id,
                  label: merchant.name,
                  sublabel: `${formatNumber(row?.orders ?? 0)} transactions`,
                  value: row?.revenue ?? 0,
                  display: formatCurrency(row?.revenue ?? 0),
                  color: merchant.color,
                };
              })
              .sort((a, b) => b.value - a.value)}
            emptyText="No sales on these dates."
          />
        </Card>
      </div>

      <InventoryByMerchant merchants={merchants} items={items} reserved={reserved} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <AlertsPanel items={items} sales={sales} today={today} merchants={allMerchants} />
        <RecentOrders orders={orders} merchants={allMerchants} showMerchant />
      </div>
    </>
  );
}

function MerchantDashboard({
  range,
  today,
  merchantId,
}: {
  range: DayRange;
  today: string;
  merchantId: string;
}) {
  const { merchants, items: allItems, orders: allOrders } = useAppData();
  const items = useMemo(() => allItems.filter((i) => i.merchantId === merchantId), [allItems, merchantId]);
  const orders = useMemo(() => allOrders.filter((o) => o.merchantId === merchantId), [allOrders, merchantId]);
  const sales: SaleLine[] = useMemo(() => flattenDelivered(orders), [orders]);
  const reserved = useMemo(() => reservedByItem(orders), [orders]);

  const current = useMemo(() => filterByRange(sales, range), [sales, range]);
  const summary = summarize(current);
  const prev = summarize(filterByRange(sales, previousOf(range)));
  const window = trendWindow(range);
  const trend = useMemo(() => buildTrend(sales, window.start, window.end), [sales, window.start, window.end]);
  const byItem = useMemo(() => groupSales(current, (line) => line.itemName).slice(0, 5), [current]);

  const open = orders.filter(isOpen);
  const stockAlerts = items.filter((item) => getStockStatus(item) !== 'ok').length;
  const toCollect = toCollectHkd(open);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="wallet"
          label="My total sales"
          value={formatCurrency(summary.revenue)}
          hint="Collected on delivered orders"
          delta={pctChange(summary.revenue, prev.revenue)}
        />
        <StatCard
          icon="truck"
          label="Orders delivered"
          value={formatNumber(summary.orders)}
          hint={`${formatNumber(summary.units)} units`}
          delta={pctChange(summary.orders, prev.orders)}
        />
        <StatCard
          icon="orders"
          label="Open orders"
          value={formatNumber(open.length)}
          hint={`${formatHkd(toCollect)} still to be collected`}
        />
        <StatCard
          icon="alert"
          label="Stock alerts"
          value={formatNumber(stockAlerts)}
          hint="Low or out-of-stock products"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Sales trend"
          subtitle={window.padded ? 'Last 14 days, for context' : 'Selected dates'}
        >
          <TrendChart data={trend} primary="revenue" />
        </Card>
        <Card title="Top products" subtitle="Selected dates">
          <BarList
            items={byItem.map((row) => ({
              key: row.key,
              label: row.key,
              sublabel: `${formatNumber(row.units)} units`,
              value: row.revenue,
              display: formatCurrency(row.revenue),
              color: merchants.find((m) => m.id === merchantId)?.color,
            }))}
          />
        </Card>
      </div>

      <Card
        flush
        title="My running inventory"
        subtitle="On hand drops when an order is delivered. Reserved is held for open orders."
        action={
          <Link href="/inventory" className="text-xs font-medium text-emerald-700 hover:underline">
            Details
          </Link>
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
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900">{item.name}</p>
                    <p className="font-mono text-xs text-slate-500">{item.sku}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold">{formatNumber(item.stock)}</td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {formatNumber(reserved.get(item.id) ?? 0)}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-emerald-700">
                    {formatNumber(availableOf(item, reserved))}
                  </td>
                  <td className="px-5 py-3.5">
                    <StockBadge status={getStockStatus(item)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <AlertsPanel items={items} sales={sales} today={today} />
        <RecentOrders orders={orders} merchants={merchants} showMerchant={false} />
      </div>
    </>
  );
}

export function DashboardView() {
  const { user } = useAuth();
  const { merchants } = useAppData();
  const { today, range, setRange } = useDayRange();
  const [merchantFilter, setMerchantFilter] = useState('all');

  if (!user) return null;
  const isAdmin = user.role === 'admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? 'Admin dashboard' : 'My dashboard'}
        description={
          isAdmin
            ? 'Sales and running inventory for every merchant. Showing transactions for the dates you pick.'
            : 'Your sales and running inventory at SDSI. Showing transactions for the dates you pick.'
        }
      />
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        {isAdmin ? (
          <MerchantFilter merchants={merchants} value={merchantFilter} onChange={setMerchantFilter} />
        ) : null}
        <DateFilter value={range} today={today} onChange={setRange} />
      </div>
      {isAdmin ? (
        <AdminDashboard range={range} merchantFilter={merchantFilter} today={today} />
      ) : user.merchantId ? (
        <MerchantDashboard range={range} today={today} merchantId={user.merchantId} />
      ) : null}
    </div>
  );
}
