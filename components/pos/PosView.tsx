'use client';

import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatNumber, roundMoney } from '@/lib/format';
import { availableOf, reservedByItem } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import { PAYMENT_METHODS, type Order, type PaymentMethod } from '@/lib/types';
import { useToday } from '@/lib/use-today';

interface Receipt {
  orders: Order[];
  total: number;
  method: PaymentMethod;
  change: number | null;
}

/** Quick cash buttons: exact, then the next bills that cover the total. */
function quickAmounts(total: number): number[] {
  if (total <= 0) return [];
  const options = new Set<number>([total]);
  for (const step of [100, 500, 1000]) {
    options.add(Math.ceil(total / step) * step);
  }
  return [...options].sort((a, b) => a - b).slice(0, 4);
}

export function PosView() {
  const { user } = useAuth();
  const { items, orders, merchants, checkoutWalkIn } = useAppData();
  const today = useToday();

  const [merchantId, setMerchantId] = useState('all');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [tendered, setTendered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const reserved = useMemo(() => reservedByItem(orders), [orders]);

  const products = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (merchantId !== 'all' && item.merchantId !== merchantId) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
    });
  }, [items, merchantId, query]);

  const cartLines = useMemo(
    () =>
      items
        .filter((item) => (cart[item.id] ?? 0) > 0)
        .map((item) => ({ item, quantity: cart[item.id] })),
    [items, cart],
  );
  const total = roundMoney(
    cartLines.reduce((sum, line) => sum + line.quantity * line.item.unitPrice, 0),
  );

  const tenderedAmount = tendered.trim() === '' ? null : Number(tendered);
  const change =
    method === 'Cash' && tenderedAmount !== null && Number.isFinite(tenderedAmount)
      ? roundMoney(tenderedAmount - total)
      : null;
  const shortBy = change !== null && change < 0 ? Math.abs(change) : 0;

  const merchantOf = (id: string) => merchants.find((merchant) => merchant.id === id);

  function add(itemId: string) {
    setReceipt(null);
    setError(null);
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] ?? 0) + 1 }));
  }

  function remove(itemId: string, all = false) {
    setError(null);
    setCart((prev) => {
      const next = { ...prev };
      const left = (next[itemId] ?? 0) - (all ? next[itemId] ?? 0 : 1);
      if (left <= 0) delete next[itemId];
      else next[itemId] = left;
      return next;
    });
  }

  function complete() {
    if (!user || cartLines.length === 0 || shortBy > 0) return;
    const result = checkoutWalkIn(user, {
      lines: cartLines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
      paymentMethod: method,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceipt({ orders: result.value, total, method, change });
    setCart({});
    setTendered('');
    setError(null);
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Walk-in POS"
        description="Counter sales. No customer details needed: tap products, take payment, done."
      />

      {receipt ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">
              Sale complete · {formatCurrency(receipt.total)} via {receipt.method}
              {receipt.change !== null && receipt.change > 0
                ? ` · change ${formatCurrency(receipt.change)}`
                : ''}
            </p>
            <p className="mt-0.5 text-emerald-800">
              Recorded as {receipt.orders.map((order) => order.id).join(', ')}
              {receipt.orders.length > 1 ? ' (one per merchant)' : ''}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReceipt(null)}
            className="text-xs font-medium text-emerald-700 hover:underline"
          >
            New sale
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Products */}
        <div className="space-y-4 lg:col-span-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by merchant">
              {[{ id: 'all', name: 'All merchants', color: '#64748b' }, ...merchants].map((merchant) => {
                const active = merchantId === merchant.id;
                return (
                  <button
                    key={merchant.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMerchantId(merchant.id)}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: active ? '#fff' : merchant.color }}
                    />
                    {merchant.name}
                  </button>
                );
              })}
            </div>
            <label className="relative block">
              <span className="sr-only">Search products</span>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {products.map((item) => {
              const merchant = merchantOf(item.merchantId);
              const inCart = cart[item.id] ?? 0;
              const left = availableOf(item, reserved) - inCart;
              const expired = Boolean(today) && item.expiryDate < today;
              const disabled = left <= 0 || expired;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => add(item.id)}
                  className="group relative flex flex-col items-start rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-emerald-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200/80 disabled:hover:shadow-sm"
                >
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="h-2 w-2 rounded-full" style={{ background: merchant?.color }} />
                    {merchant?.name}
                  </span>
                  <span className="mt-1 text-sm font-medium text-slate-900">{item.name}</span>
                  <span className="mt-0.5 font-mono text-xs text-slate-500">{item.sku}</span>
                  <span className="mt-3 flex w-full items-end justify-between">
                    <span className="text-lg font-semibold text-slate-900">
                      {formatCurrency(item.unitPrice)}
                    </span>
                    <span
                      className={`text-xs ${
                        expired || left <= 0 ? 'font-medium text-rose-600' : 'text-slate-500'
                      }`}
                    >
                      {expired ? 'Expired' : left <= 0 ? 'Out of stock' : `${formatNumber(left)} left`}
                    </span>
                  </span>
                  {inCart > 0 ? (
                    <span className="absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">
                      {inCart}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {products.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">
              No products match your search.
            </p>
          ) : null}
        </div>

        {/* Cart */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-6">
            <Card title="Current sale" subtitle="Walk-in customer">
              <div className="mt-3 space-y-4">
                {cartLines.length === 0 ? (
                  <p className="rounded-xl bg-slate-50 py-8 text-center text-sm text-slate-500">
                    Tap a product to add it.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {cartLines.map(({ item, quantity }) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatCurrency(item.unitPrice)} · {merchantOf(item.merchantId)?.name}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => remove(item.id)}
                            aria-label={`Remove one ${item.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            <Icon name="minus" className="h-4 w-4" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => add(item.id)}
                            disabled={availableOf(item, reserved) - quantity <= 0}
                            aria-label={`Add one ${item.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Icon name="plus" className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(item.id, true)}
                            aria-label={`Remove ${item.name} from the sale`}
                            className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Icon name="x" className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex items-baseline justify-between border-t border-slate-200 pt-4">
                  <span className="text-sm text-slate-600">Total</span>
                  <span className="text-2xl font-semibold tracking-tight text-slate-900">
                    {formatCurrency(total)}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {PAYMENT_METHODS.map((option) => {
                    const active = method === option;
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setMethod(option)}
                        className={`rounded-lg border px-1 py-2 text-[11px] font-medium leading-tight transition-colors ${
                          active
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>

                {method === 'Cash' && total > 0 ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700" htmlFor="tendered">
                      Cash received
                    </label>
                    <input
                      id="tendered"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={tendered}
                      onChange={(event) => setTendered(event.target.value)}
                      placeholder={formatCurrency(total)}
                      className={inputClass(shortBy > 0)}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {quickAmounts(total).map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setTendered(String(amount))}
                          className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {amount === total ? 'Exact' : formatCurrency(amount)}
                        </button>
                      ))}
                    </div>
                    {shortBy > 0 ? (
                      <p role="alert" className="text-xs text-rose-600">
                        Short by {formatCurrency(shortBy)}.
                      </p>
                    ) : change !== null && change > 0 ? (
                      <p className="text-sm font-medium text-emerald-700">
                        Change: {formatCurrency(change)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {error ? (
                  <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={complete}
                  disabled={cartLines.length === 0 || shortBy > 0}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="check" className="h-4 w-4" />
                  Complete sale
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
