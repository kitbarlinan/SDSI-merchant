'use client';

import { useMemo, useState } from 'react';
import { ProductList, parseQuantities, type ListRow } from '@/components/orders/ProductList';
import { PageHeader } from '@/components/layout/PageHeader';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { isSellable, livePickup } from '@/lib/costing';
import { formatDate, formatHkd, roundMoney } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { availableOf, reservedByItem } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import { PAYMENT_METHODS, type Order, type PaymentMethod } from '@/lib/types';
import { useToday } from '@/lib/use-today';

const DEFAULT_NAME = 'Walk-in client';

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
  for (const step of [10, 50, 100, 500, 1000]) options.add(Math.ceil(total / step) * step);
  return [...options].sort((a, b) => a - b).slice(0, 5);
}

export function PosView() {
  const { user } = useAuth();
  const { items, orders, merchants, costing, checkoutWalkIn } = useAppData();
  const today = useToday() || MOCK_TODAY;

  const [typed, setTyped] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState(DEFAULT_NAME);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [tendered, setTendered] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const reserved = useMemo(() => reservedByItem(orders), [orders]);
  const rows: ListRow[] = useMemo(
    () =>
      items.filter((item) => isSellable(item, costing)).map((item) => ({
        item,
        available: availableOf(item, reserved),
        expired: item.expiryDate < today,
        pickupHkd: livePickup(costing, item.id) ?? 0,
      })),
    [items, reserved, today, costing],
  );

  const parsed = parseQuantities(rows, typed);
  const total = parsed.totalHkd;
  const hasRowErrors = Object.keys(parsed.errors).length > 0;

  const tenderedAmount = tendered.trim() === '' ? null : Number(tendered);
  const change =
    method === 'Cash' && tenderedAmount !== null && Number.isFinite(tenderedAmount)
      ? roundMoney(tenderedAmount - total)
      : null;
  const shortBy = change !== null && change < 0 ? Math.abs(change) : 0;
  const canSubmit = parsed.lines.length > 0 && !hasRowErrors && shortBy === 0;

  function complete() {
    if (!user || !canSubmit) return;
    const result = checkoutWalkIn(user, {
      lines: parsed.lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
      paymentMethod: method,
      customerName,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReceipt({ orders: result.value, total, method, change });
    setTyped({});
    setTendered('');
    setCustomerName(DEFAULT_NAME);
    setError(null);
  }

  if (!user) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Walk-in POS"
        description="Counter sales. Type the quantity on each product, take payment, done. The customer name is optional."
      />

      {receipt ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">
              Sale complete · {formatHkd(receipt.total)} via {receipt.method}
              {receipt.change !== null && receipt.change > 0
                ? ` · change ${formatHkd(receipt.change)}`
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
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="grid gap-x-6 gap-y-4 md:grid-cols-3">
          <div className="text-sm">
            <p className="text-xs font-medium text-slate-500">Date</p>
            <p className="mt-1 font-semibold text-slate-900">{formatDate(today)}</p>
          </div>
          <Field label="Customer (optional)" htmlFor="walkInName">
            <input
              id="walkInName"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              onFocus={(event) => event.target.select()}
              className={inputClass(false)}
            />
          </Field>
          <Field label="Payment option" htmlFor="walkInPayment">
            <select
              id="walkInPayment"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              className={inputClass(false)}
            >
              {PAYMENT_METHODS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <ProductList
        rows={rows}
        merchants={merchants}
        typed={typed}
        errors={parsed.errors}
        showMerchant
        onChange={(itemId, value) => {
          setReceipt(null);
          setError(null);
          setTyped((prev) => ({ ...prev, [itemId]: value }));
        }}
        footer={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            {method === 'Cash' && total > 0 ? (
              <div className="max-w-xs flex-1 space-y-2">
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
                  placeholder={formatHkd(total)}
                  className={inputClass(shortBy > 0)}
                />
                <div className="flex flex-wrap gap-1.5">
                  {quickAmounts(total).map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setTendered(String(amount))}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      {amount === total ? 'Exact' : formatHkd(amount)}
                    </button>
                  ))}
                </div>
                {shortBy > 0 ? (
                  <p role="alert" className="text-xs text-rose-600">
                    Short by {formatHkd(shortBy)}.
                  </p>
                ) : change !== null && change > 0 ? (
                  <p className="text-sm font-medium text-emerald-700">Change: {formatHkd(change)}</p>
                ) : null}
              </div>
            ) : (
              <span />
            )}
            <div className="w-full max-w-xs space-y-1 text-sm sm:ml-auto">
              <p className="flex justify-between text-slate-600">
                <span>Total (HKD)</span>
                <span>{formatHkd(total)}</span>
              </p>
              <p className="flex justify-between border-t border-slate-200 pt-1 text-xl font-semibold text-slate-900">
                <span>Net total (HKD)</span>
                <span>{formatHkd(total)}</span>
              </p>
            </div>
          </div>
        }
      />

      {error ? (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={complete}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check" className="h-4 w-4" />
          Complete sale
        </button>
      </div>
    </div>
  );
}
