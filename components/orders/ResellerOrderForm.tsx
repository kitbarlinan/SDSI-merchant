'use client';

import { BranchSelect } from '@/components/ui/BranchSelect';
import { DEFAULT_BRANCH, type BranchId } from '@/lib/types';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProductList, parseQuantities, type ListRow } from '@/components/orders/ProductList';
import { Field, inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { inResellerProgram, isSellable, livePickup } from '@/lib/costing';
import { formatHkd, roundMoney } from '@/lib/format';
import { walletHkd } from '@/lib/wallet';
import { MOCK_TODAY } from '@/lib/mock-data';
import { expiryOf, makeStockBook } from '@/lib/stock';
import { useAppData } from '@/lib/store';
import type { Order } from '@/lib/types';
import { useToday } from '@/lib/use-today';

/** A reseller / customer orders for pickup, with the reseller discount. */
export function ResellerOrderForm({ personal = false }: { personal?: boolean }) {
  const { user } = useAuth();
  const { items, products, orders, merchants, costing, packageSales, earningPayouts, placeResellerOrder } = useAppData();
  const today = useToday() || MOCK_TODAY;

  const [typed, setTyped] = useState<Record<string, string>>({});
  const [contactNo, setContactNo] = useState('');
  const [branch, setBranch] = useState<BranchId>(DEFAULT_BRANCH);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<Order[] | null>(null);

  const pct = costing.settings.resellerDiscountPct;
  const fx = costing.settings.payoutFxPhpPerHkd;
  const active = personal || Boolean(user && packageSales.some((sale) => sale.resellerId === user.id));
  const book = useMemo(() => makeStockBook(items, products, orders), [items, products, orders]);
  const rows: ListRow[] = useMemo(
    () =>
      items
        // Until the package is bought it is the only thing a reseller can order. After that it is hidden.
        // Resellers see only the reseller program. A merchant buying for themselves also sees their own products.
        .filter((item) => isSellable(item, costing) && (active ? !item.package && (inResellerProgram(item, costing) || (personal && user?.role === 'merchant' && item.merchantId === user.merchantId)) : Boolean(item.package)))
        .map((item) => ({
          item,
          available: book.available(item, branch),
          elsewhere: book.elsewhere(item, branch),
          expired: expiryOf(item, products) < today,
          pickupHkd: livePickup(costing, item.id) ?? 0,
          unitDiscountHkd: inResellerProgram(item, costing) ? roundMoney(((livePickup(costing, item.id) ?? 0) * pct) / 100) : 0,
        })),
    [items, products, book, today, costing, active, pct, fx, branch, personal, user],
  );

  const parsed = parseQuantities(rows, typed);
  const subtotal = parsed.totalHkd;
  // The discount is a percent of the pickup price (HKD) of the program products.
  const discount = roundMoney(parsed.lines.reduce((sum, line) => sum + (inResellerProgram(line.item, costing) ? roundMoney(((livePickup(costing, line.item.id) ?? 0) * line.quantity * pct) / 100) : 0), 0));
  const wallet = useMemo(() => (user ? walletHkd(user.id, orders, packageSales, costing, earningPayouts) : null), [user, orders, packageSales, costing, earningPayouts]);
  const [payFromWallet, setPayFromWallet] = useState(false);
  const toPay = roundMoney(subtotal - discount);
  const canSubmit = parsed.lines.length > 0 && Object.keys(parsed.errors).length === 0 && ((!personal && !payFromWallet) || (wallet?.availableHkd ?? 0) >= toPay);

  if (!user) return null;

  async function submit() {
    if (!user || !canSubmit) return;
    const result = await placeResellerOrder(user, {
      customerName: user.name,
      contactNo,
      notes,
      branch,
      payFromWallet: personal || (payFromWallet && active),
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
        title={personal ? 'Buy for myself' : 'New Order'}
        description={
          personal
            ? `For your own use or samples. Paid from your wallet, collected at the counter. Reseller program products show ${pct}% off; your own products are at the normal price.`
            : active
            ? `Pickup only. You pay at the counter when you collect. These are the products in the reseller program, with ${pct}% off.`
            : 'Pickup only. Start with the reseller package. Once it is delivered you are a reseller and can order everything with the reseller discount.'
        }
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
              {placed[0]?.payFromWallet ? 'Charged to your wallet' : 'Pay'} {formatHkd(placed.reduce((sum, order) => sum + (order.amountHkd ?? 0), 0))} {placed[0]?.payFromWallet ? 'when it is delivered.' : 'at pickup.'}{' '}
              <Link href={personal ? '/wallet' : '/orders'} className="font-medium underline">
                See my orders
              </Link>
            </p>
          </div>
        </div>
      ) : null}

      <ProductList
        rows={rows}
        // Only the merchants that have a product the person can order (the reseller program).
        merchants={merchants.filter((merchant) => rows.some((row) => row.item.merchantId === merchant.id))}
        typed={typed}
        errors={parsed.errors}
        showMerchant
        onChange={(itemId, value) => {
          setPlaced(null);
          setError(null);
          setTyped((prev) => ({ ...prev, [itemId]: value }));
        }}
        footer={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid max-w-md flex-1 gap-3 sm:grid-cols-2">
              <BranchSelect id="resellerBranch" label="Pick up at" value={branch} onChange={setBranch} />
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
              {active ? (
                <p className="flex justify-between text-emerald-700">
                  <span>Reseller discount {pct}%</span>
                  <span>− {formatHkd(discount)}</span>
                </p>
              ) : null}
              <p className="flex justify-between border-t border-slate-200 pt-1 text-xl font-semibold text-slate-900">
                <span>{personal || payFromWallet ? 'Charged to wallet' : 'To pay at pickup'}</span>
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

      {personal && wallet ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          Wallet available: <strong>{formatHkd(Math.max(0, wallet.availableHkd))}</strong>.{' '}
          {wallet.availableHkd < toPay ? 'Not enough for this order: reduce the quantity.' : 'It is charged when the order is delivered.'}
        </p>
      ) : null}

      {active && !personal && wallet ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <label htmlFor="resellerMop" className="font-medium text-slate-900">Mode of payment</label>
          <select
            id="resellerMop"
            value={payFromWallet ? 'wallet' : 'cop'}
            onChange={(event) => setPayFromWallet(event.target.value === 'wallet')}
            className="mt-1 block w-full max-w-sm rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="cop">COP: pay at the counter when you collect</option>
            <option value="wallet">Wallet: charged to my wallet when delivered</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Wallet available: {formatHkd(Math.max(0, wallet.availableHkd))}.{' '}
            {payFromWallet && wallet.availableHkd < toPay ? 'Not enough for this order: choose COP.' : ''}
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="check" className="h-4 w-4" />
          Place order
        </button>
      </div>
    </div>
  );
}
