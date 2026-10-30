'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProductList, parseQuantities, type ListRow } from '@/components/orders/ProductList';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { isSellable, livePickup } from '@/lib/costing';
import { formatHkd, roundMoney } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { availableOf, reservedByItem } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import type { Order } from '@/lib/types';
import { useToday } from '@/lib/use-today';

/** A reseller / customer orders for pickup, with the reseller discount. */
export function ResellerOrderForm() {
  const { user } = useAuth();
  const { items, orders, merchants, costing, placeResellerOrder } = useAppData();
  const today = useToday() || MOCK_TODAY;

  const [typed, setTyped] = useState<Record<string, string>>({});
  const [contactNo, setContactNo] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order[] | null>(null);

  const pct = costing.settings.resellerDiscountPct;
  const reserved = useMemo(() => reservedByItem(orders), [orders]);
  const rows: ListRow[] = useMemo(
    () =>
      items
        .filter((item) => isSellable(item, costing))
        .map((item) => ({
          item,
          available: availableOf(item, reserved),
          expired: item.expiryDate < today,
          pickupHkd: livePickup(costing, item.id) ?? 0,
        })),
    [items, reserved, today, costing],
  );

  const parsed = parseQuantities(rows, typed);
  const subtotal = parsed.totalHkd;
  const discount = roundMoney((subtotal * pct) / 100);
  const toPay = roundMoney(subtotal - discount);
  const canSubmit = parsed.lines.length > 0 && Object.keys(parsed.errors).length === 0;

  if (!user) return null;

  function submit() {
    if (!user || !canSubmit) return;
    const result = placeResellerOrder(user, {
      customerName: user.name,
      contactNo,
      notes,
      lines: parsed.lines.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
    });
    if (!result.ok) return setError(result.error);
    setError(null);
    setPlaced(result.value);
    setTyped({});
    setNotes('');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New Order"
        description={`Pickup only. You pay at the counter when you collect. Your reseller discount of ${pct}% is already taken off the prices.`}
      />

      {placed ? (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div className="flex-1">
            <p className="font-medium">
              Order placed: {placed.map((order) => order.id).join(', ')}
              {placed.length > 1 ? ' (one order per merchant)' : ''}
            </p>
            <p className="mt-0.5 text-emerald-800">
              Pay {formatHkd(placed.reduce((sum, order) => sum + (order.amountHkd ?? 0), 0))} at pickup.{' '}
              <Link href="/orders" className="font-medium underline">
                See my orders
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      <ProductList
        rows={rows}
        merchants={merchants}
        typed={typed}
        errors={parsed.errors}
        showMerchant
        discountPct={pct}
        onChange={(itemId, value) => {
          setPlaced(null);
          setError(null);
          setTyped((prev) => ({ ...prev, [itemId]: value }));
        }}
        footer={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid max-w-md flex-1 gap-3 sm:grid-cols-2">
              <Field label="Mobile # (optional)" htmlFor="resellerContact">
                <input
                  id="resellerContact"
                  type="tel"
                  value={contactNo}
                  onChange={(event) => setContactNo(event.target.value)}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="Note (optional)" htmlFor="resellerNotes">
                <input
                  id="resellerNotes"
                  type="text"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className={inputClass(false)}
                />
              </Field>
            </div>
            <div className="w-full max-w-xs space-y-1 text-sm sm:ml-auto">
              <p className="flex justify-between text-slate-600">
                <span>Subtotal (HKD)</span>
                <span>{formatHkd(subtotal)}</span>
              </p>
              <p className="flex justify-between text-emerald-700">
                <span>Reseller discount {pct}%</span>
                <span>− {formatHkd(discount)}</span>
              </p>
              <p className="flex justify-between border-t border-slate-200 pt-1 text-xl font-semibold text-slate-900">
                <span>To pay at pickup</span>
                <span>{formatHkd(toPay)}</span>
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
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check" className="h-4 w-4" />
          Place order
        </button>
      </div>
    </div>
  );
}
