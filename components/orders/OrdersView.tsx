'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { OrderCard } from '@/components/orders/OrderCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { StatCard } from '@/components/ui/StatCard';
import { useAuth } from '@/lib/auth';
import { formatHkd, formatNumber } from '@/lib/format';
import { isOpen, sortNewestFirst, sortOldestFirst, toCollectHkd } from '@/lib/orders';
import { useAppData } from '@/lib/store';

type Tab = 'open' | 'pending' | 'packed' | 'shipped' | 'delivered' | 'rts' | 'cancelled' | 'all';

const TABS: { key: Tab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'To pack' },
  { key: 'packed', label: 'Packed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'rts', label: 'RTS' },
  { key: 'cancelled', label: 'Not delivered' },
  { key: 'all', label: 'All' },
];

const PAGE_SIZE = 24;

export function OrdersView() {
  const { user } = useAuth();
  const { orders, merchants } = useAppData();

  const isMerchant = user?.role === 'merchant';
  const [tab, setTab] = useState<Tab>('open');
  const [merchantId, setMerchantId] = useState('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => setLimit(PAGE_SIZE), [tab, merchantId, query]);

  // Merchants only ever see their own orders; staff can narrow down by merchant.
  const scoped = useMemo(() => {
    if (!user) return [];
    if (user.role === 'merchant') return orders.filter((order) => order.merchantId === user.merchantId);
    return merchantId === 'all' ? orders : orders.filter((order) => order.merchantId === merchantId);
  }, [orders, user, merchantId]);

  const stats = useMemo(() => {
    const open = scoped.filter(isOpen);
    return {
      pending: open.filter((order) => order.status === 'pending').length,
      packed: open.filter((order) => order.status === 'packed').length,
      shipped: open.filter((order) => order.status === 'shipped').length,
      toCollect: toCollectHkd(open),
    };
  }, [scoped]);

  const counts = useMemo(
    (): Record<Tab, number> => ({
      open: scoped.filter(isOpen).length,
      pending: scoped.filter((order) => order.status === 'pending').length,
      packed: scoped.filter((order) => order.status === 'packed').length,
      shipped: scoped.filter((order) => order.status === 'shipped').length,
      delivered: scoped.filter((order) => order.status === 'delivered').length,
      rts: scoped.filter((order) => order.status === 'rts').length,
      cancelled: scoped.filter((order) => order.status === 'cancelled').length,
      all: scoped.length,
    }),
    [scoped],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = scoped.filter((order) => {
      if (tab === 'open' && !isOpen(order)) return false;
      if (tab !== 'open' && tab !== 'all' && order.status !== tab) return false;
      if (!needle) return true;
      return (
        order.id.toLowerCase().includes(needle) ||
        (order.waybill ?? '').toLowerCase().includes(needle) ||
        (order.customerName ?? 'walk-in client').toLowerCase().includes(needle) ||
        order.lines.some(
          (line) =>
            line.name.toLowerCase().includes(needle) || line.sku.toLowerCase().includes(needle),
        )
      );
    });
    // Open orders: longest-waiting first so nothing gets forgotten.
    return tab === 'open' ? sortOldestFirst(matching) : sortNewestFirst(matching);
  }, [scoped, tab, query]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isMerchant ? 'My Orders' : 'Orders'}
        description={
          isMerchant
            ? 'Track the orders you placed. COD orders get a waybill once they ship.'
            : 'Pack incoming orders. Ship COD with a waybill, then mark delivered once payment is collected.'
        }
        actions={
          isMerchant ? (
            <Link
              href="/orders/new"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              <Icon name="plus" className="h-4 w-4" />
              New order
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          variant="primary"
          icon="orders"
          label="To pack"
          value={formatNumber(stats.pending)}
          hint="Pending orders"
        />
        <StatCard
          icon="box"
          label="Packed"
          value={formatNumber(stats.packed)}
          hint="Waiting to ship or be picked up"
        />
        <StatCard
          icon="truck"
          label="Shipped"
          value={formatNumber(stats.shipped)}
          hint="On the road, payment not collected yet"
        />
        <StatCard
          icon="wallet"
          label="Cash to collect"
          value={formatHkd(stats.toCollect)}
          hint="Open orders, in HKD"
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="group"
          aria-label="Order status"
          className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
        >
          {TABS.map((option) => {
            const active = option.key === tab;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(option.key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {option.label}
                <span
                  className={`rounded-full px-1.5 text-xs ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {formatNumber(counts[option.key])}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!isMerchant ? (
            <label>
              <span className="sr-only">Filter by merchant</span>
              <select
                value={merchantId}
                onChange={(event) => setMerchantId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
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
          <label className="relative block">
            <span className="sr-only">Search orders</span>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search POID, waybill, customer"
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-64"
            />
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-sm font-medium text-slate-900">
            {tab === 'open' ? 'No open orders. Nice work!' : 'No orders here.'}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {tab === 'open' && isMerchant ? 'Place a new order and it will show up here.' : 'Try a different tab or search.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visible.slice(0, limit).map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                merchant={merchants.find((merchant) => merchant.id === order.merchantId)}
                showMerchant={!isMerchant}
              />
            ))}
          </div>
          {visible.length > limit ? (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setLimit((current) => current + PAGE_SIZE)}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Show more ({formatNumber(visible.length - limit)} left)
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
