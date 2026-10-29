'use client';

import Link from 'next/link';
import { useState } from 'react';
import { OrderStatusBadge, TermsBadge } from '@/components/orders/OrderBadges';
import { Badge } from '@/components/ui/Badge';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateTime, formatHkd, formatNumber } from '@/lib/format';
import { TERMS_LABEL, orderAmountLabel, orderTotal } from '@/lib/orders';
import { isStaff } from '@/lib/roles';
import { useAppData, type ActionResult } from '@/lib/store';
import { PAYMENT_METHODS, type Merchant, type Order, type PaymentMethod } from '@/lib/types';

const CANCEL_REASONS = [
  'Customer unreachable',
  'Customer refused the order',
  'Wrong or incomplete address',
  'Customer could not pay',
  'Other',
];

const RTS_REASONS = [
  'Customer refused the order',
  'Customer unreachable',
  'Wrong or incomplete address',
  'Customer could not pay on delivery',
  'Other',
];

type Panel = 'ship' | 'deliver' | 'rts' | 'cancel' | 'reverse' | null;

const buttonBase = 'rounded-xl px-3 py-2 text-sm font-semibold text-white';
const ghostButton =
  'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50';

export function OrderCard({
  order,
  merchant,
  showMerchant,
}: {
  order: Order;
  merchant?: Merchant;
  showMerchant: boolean;
}) {
  const { user } = useAuth();
  const { users, reversals, remittances, markPacked, shipOrder, markDelivered, markRts, cancelOrder, requestReversal } =
    useAppData();

  const [panel, setPanel] = useState<Panel>(null);
  const [waybill, setWaybill] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reverseNote, setReverseNote] = useState('');

  if (!user) return null;

  const canHandle = isStaff(user.role);
  const total = orderTotal(order);
  // The cashier and the clerk only deal in HKD. The peso Net SRP (what is remitted) is for the admin and the merchant.
  const showPeso = user.role === 'admin' || user.role === 'merchant';
  const requests = order.status === 'delivered' ? reversals.filter((request) => request.orderId === order.id) : [];
  const pendingRequest = requests.find((request) => request.status === 'pending');
  const lastRejected = requests.find((request) => request.status === 'rejected');
  const remitted = order.status === 'delivered' && remittances.some((remittance) => remittance.orderIds.includes(order.id));
  const nameOf = (id?: string) => users.find((candidate) => candidate.id === id)?.name;

  const finish = <T,>(result: ActionResult<T>) => {
    if (result.ok) {
      setError(null);
      setPanel(null);
    } else {
      setError(result.error);
    }
  };
  const open = (next: Panel) => {
    setError(null);
    setReason(next === 'rts' ? RTS_REASONS[0] : CANCEL_REASONS[0]);
    setOtherReason('');
    setPanel(next);
  };

  const finalReason = reason === 'Other' ? otherReason : reason;
  const reasonList = panel === 'rts' ? RTS_REASONS : CANCEL_REASONS;
  const isCod = order.terms === 'COD';

  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className="font-mono text-sm font-semibold text-slate-900">{order.id}</p>
          <p className="text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
          {showMerchant && merchant ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
              {merchant.name}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <OrderStatusBadge status={order.status} />
          <TermsBadge terms={order.terms} />
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_20rem]">
        <div className="space-y-3 p-4">
          <div className="space-y-1 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-slate-800">
              <Icon name="user" className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{order.customerName ?? 'Walk-in client'}</span>
              {order.source === 'walk-in' ? <Badge tone="slate">Walk-in</Badge> : null}
              {order.contactNo ? <span className="text-xs text-slate-500">{order.contactNo}</span> : null}
            </p>
            {order.address ? (
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                {order.address}
              </p>
            ) : null}
          </div>

          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60">
            {order.lines.map((line) => (
              <li key={line.itemId} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-slate-900">
                    <span className="font-semibold">{formatNumber(line.quantity)}×</span> {line.name}
                  </p>
                  <p className="font-mono text-xs text-slate-500">{line.sku}</p>
                </div>
                {showPeso ? <p className="shrink-0 text-slate-700">{formatCurrency(line.total)}</p> : null}
              </li>
            ))}
          </ul>

          {order.notes ? <p className="text-xs text-slate-500">Note: {order.notes}</p> : null}

          {order.waybill ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900">
              <Icon name="truck" className="h-4 w-4" />
              <span>
                Waybill <span className="font-mono font-semibold">{order.waybill}</span>
              </span>
              {order.shippedAt ? <span className="text-violet-700">· shipped {formatDateTime(order.shippedAt)}</span> : null}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-slate-100 p-4 lg:border-l lg:border-t-0">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-500">
              {order.status === 'delivered' ? 'Collected' : 'To collect'} · {TERMS_LABEL[order.terms]}
            </span>
            <span className="text-lg font-semibold text-slate-900">{orderAmountLabel(order)}</span>
          </div>
          {order.amountHkd != null && showPeso ? (
            <p className="flex justify-between text-xs">
              <span className="text-slate-500">Net SRP, remit to merchant</span>
              <span className="font-medium text-slate-700">{formatCurrency(total)}</span>
            </p>
          ) : null}
          {isCod ? (
            order.collectionFeeHkd != null && order.sfHkd != null ? (
              <div className="space-y-0.5 text-xs">
                <p className="flex justify-between">
                  <span className="text-slate-500">SF (shipping fee, HKD)</span>
                  <span className="font-semibold text-slate-800">{formatHkd(order.sfHkd)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500">CF (collection fee, HKD)</span>
                  <span className="font-semibold text-slate-800">{formatHkd(order.collectionFeeHkd)}</span>
                </p>
                {order.netCodHkd != null ? (
                  <p className="flex justify-between border-t border-slate-100 pt-0.5">
                    <span className="text-slate-500">Net COD price (HKD)</span>
                    <span className="font-semibold text-slate-900">{formatHkd(order.netCodHkd)}</span>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-amber-700">SF / CF not set (no live costing for these items)</p>
            )
          ) : null}

          {order.status === 'delivered' && order.deliveredAt ? (
            <p className="text-xs text-emerald-700">
              Paid via {order.paymentMethod} · {formatDateTime(order.deliveredAt)}
              {nameOf(order.handledBy) ? ` · ${nameOf(order.handledBy)}` : ''}
            </p>
          ) : null}

          {canHandle && order.status === 'delivered' ? (
            <div className="space-y-2">
              {pendingRequest ? (
                <p className="rounded-xl bg-amber-50 p-2.5 text-xs text-amber-900">
                  <span className="font-semibold">Reversal waiting for approval</span> ({pendingRequest.id}). Your note:
                  “{pendingRequest.note}”
                </p>
              ) : remitted ? (
                <p className="text-xs text-slate-500">
                  Locked: this order is in a closed remittance week and can no longer be reversed.
                </p>
              ) : panel === 'reverse' ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <label className="block text-xs font-medium text-amber-900">
                    Why is this delivered order being undone? (required)
                    <textarea
                      autoFocus
                      rows={3}
                      value={reverseNote}
                      onChange={(event) => setReverseNote(event.target.value)}
                      placeholder="e.g. Clicked delivered by mistake, the customer has not paid yet"
                      className={`mt-1 ${inputClass(false)}`}
                    />
                  </label>
                  <p className="text-xs text-amber-800">
                    Nothing changes yet. The inventory clerk or admin must approve it first.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={reverseNote.trim().length < 5}
                      onClick={() => {
                        const result = requestReversal(user, order.id, reverseNote);
                        finish(result);
                        if (result.ok) setReverseNote('');
                      }}
                      className={`flex-1 bg-amber-600 hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50 ${buttonBase}`}
                    >
                      Send for approval
                    </button>
                    <button type="button" onClick={() => setPanel(null)} className={ghostButton}>
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => open('reverse')}
                  className="w-full rounded-xl border border-amber-300 px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-50"
                >
                  Request reversal
                </button>
              )}
              {lastRejected && !pendingRequest ? (
                <p className="text-xs text-slate-500">
                  Last request rejected{lastRejected.decisionNote ? `: ${lastRejected.decisionNote}` : '.'}
                </p>
              ) : null}
            </div>
          ) : null}

          {order.status === 'cancelled' ? (
            <p className="text-xs text-slate-600">
              Not delivered: {order.cancelReason}
              {order.cancelledAt ? ` · ${formatDateTime(order.cancelledAt)}` : ''}
            </p>
          ) : null}

          {order.status === 'rts' ? (
            <div className="space-y-1 text-xs text-rose-700">
              <p>
                Returned to sender: {order.rtsReason}
                {order.rtsAt ? ` · ${formatDateTime(order.rtsAt)}` : ''}
              </p>
              <p className="text-slate-500">
                {order.returnReceiptId
                  ? `Goods received back (${order.returnReceiptId}).`
                  : 'Goods not received back yet.'}{' '}
                <Link href="/inventory" className="font-medium text-emerald-700 hover:underline">
                  Inventory → RTS
                </Link>
              </p>
            </div>
          ) : null}

          {order.status === 'pending' && !canHandle ? (
            <p className="text-xs text-slate-500">Waiting for the cashier to pack this order.</p>
          ) : null}
          {order.status === 'packed' && !canHandle ? (
            <p className="text-xs text-slate-500">
              Packed.{' '}
              {isCod
                ? 'The cashier will ship it and add the waybill.'
                : 'Ready for pickup. The cashier marks it delivered once payment is collected.'}
            </p>
          ) : null}
          {order.status === 'shipped' && !canHandle ? (
            <p className="text-xs text-slate-500">
              On its way. Track it with the waybill above. It is marked delivered once the customer
              pays.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
              {error}
            </p>
          ) : null}

          {canHandle && (order.status === 'pending' || order.status === 'packed' || order.status === 'shipped') ? (
            <>
              {panel === 'ship' ? (
                <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <label className="block text-xs font-medium text-violet-900">
                    Waybill / tracking number
                    <input
                      type="text"
                      autoFocus
                      value={waybill}
                      onChange={(event) => setWaybill(event.target.value)}
                      onKeyDown={(event) =>
                        event.key === 'Enter' && finish(shipOrder(user, order.id, waybill))
                      }
                      placeholder="e.g. WB-123456789"
                      className={`mt-1 ${inputClass(false)}`}
                    />
                  </label>
                  <p className="text-xs text-violet-800">
                    The merchant sees this number. The goods leave the warehouse now.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => finish(shipOrder(user, order.id, waybill))}
                      className={`flex-1 bg-violet-600 hover:bg-violet-500 ${buttonBase}`}
                    >
                      Confirm shipped
                    </button>
                    <button type="button" onClick={() => setPanel(null)} className={ghostButton}>
                      Back
                    </button>
                  </div>
                </div>
              ) : null}

              {panel === 'deliver' ? (
                <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-sm font-medium text-emerald-900">
                    Collect {orderAmountLabel(order)} from the customer
                  </p>
                  <label className="block text-xs font-medium text-emerald-900">
                    Paid via
                    <select
                      value={method}
                      onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                      className={`mt-1 ${inputClass(false)}`}
                    >
                      {PAYMENT_METHODS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => finish(markDelivered(user, order.id, method))}
                      className={`flex-1 bg-emerald-600 hover:bg-emerald-500 ${buttonBase}`}
                    >
                      Payment received · Delivered
                    </button>
                    <button type="button" onClick={() => setPanel(null)} className={ghostButton}>
                      Back
                    </button>
                  </div>
                </div>
              ) : null}

              {panel === 'rts' || panel === 'cancel' ? (
                <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm font-medium text-rose-900">
                    {panel === 'rts' ? 'Why is it returning to sender?' : 'Why was it not delivered?'}
                  </p>
                  <select
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    aria-label="Reason"
                    className={inputClass(false)}
                  >
                    {reasonList.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {reason === 'Other' ? (
                    <input
                      type="text"
                      value={otherReason}
                      onChange={(event) => setOtherReason(event.target.value)}
                      placeholder="Type the reason"
                      className={inputClass(false)}
                    />
                  ) : null}
                  <p className="text-xs text-rose-800">
                    {panel === 'rts'
                      ? 'No sale is recorded. When the parcel is back, receive it under Inventory → RTS so it returns to stock.'
                      : 'The reserved stock goes back to the merchant. No sale is recorded.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        finish(
                          panel === 'rts'
                            ? markRts(user, order.id, finalReason)
                            : cancelOrder(user, order.id, finalReason),
                        )
                      }
                      className={`flex-1 bg-rose-600 hover:bg-rose-500 ${buttonBase}`}
                    >
                      {panel === 'rts' ? 'Confirm RTS' : 'Confirm not delivered'}
                    </button>
                    <button type="button" onClick={() => setPanel(null)} className={ghostButton}>
                      Back
                    </button>
                  </div>
                </div>
              ) : null}

              {panel === null ? (
                <div className="flex gap-2">
                  {order.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => finish(markPacked(user, order.id))}
                      className={`flex flex-1 items-center justify-center gap-2 bg-sky-600 hover:bg-sky-500 ${buttonBase}`}
                    >
                      <Icon name="box" className="h-4 w-4" />
                      Mark packed
                    </button>
                  ) : null}
                  {order.status === 'packed' && isCod ? (
                    <button
                      type="button"
                      onClick={() => open('ship')}
                      className={`flex flex-1 items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 ${buttonBase}`}
                    >
                      <Icon name="truck" className="h-4 w-4" />
                      Ship with waybill
                    </button>
                  ) : null}
                  {(order.status === 'packed' && !isCod) || order.status === 'shipped' ? (
                    <button
                      type="button"
                      onClick={() => open('deliver')}
                      className={`flex flex-1 items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 ${buttonBase}`}
                    >
                      <Icon name="check" className="h-4 w-4" />
                      Mark delivered
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => open(order.status === 'shipped' ? 'rts' : 'cancel')}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {order.status === 'shipped' ? 'RTS' : 'Not delivered'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
