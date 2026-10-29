'use client';

import { useState } from 'react';
import { OrderStatusBadge, TermsBadge } from '@/components/orders/OrderBadges';
import { Badge } from '@/components/ui/Badge';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/format';
import { TERMS_LABEL, orderTotal } from '@/lib/orders';
import { useAppData, type ActionResult } from '@/lib/store';
import { PAYMENT_METHODS, type Merchant, type Order, type PaymentMethod } from '@/lib/types';

const CANCEL_REASONS = [
  'Customer unreachable',
  'Customer refused the order',
  'Wrong or incomplete address',
  'Customer could not pay',
  'Other',
];

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
  const { users, markPacked, markDelivered, cancelOrder } = useAppData();

  const [panel, setPanel] = useState<'deliver' | 'cancel' | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [otherReason, setOtherReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const isStaff = user.role !== 'merchant';
  const total = orderTotal(order);
  const nameOf = (id?: string) => users.find((candidate) => candidate.id === id)?.name;

  const finish = <T,>(result: ActionResult<T>) => {
    if (result.ok) {
      setError(null);
      setPanel(null);
    } else {
      setError(result.error);
    }
  };

  const finalReason = reason === 'Other' ? otherReason : reason;

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <p className="font-mono text-sm font-semibold text-slate-900">{order.id}</p>
          <p className="text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          <OrderStatusBadge status={order.status} />
          <TermsBadge terms={order.terms} />
        </div>
      </header>

      <div className="flex-1 space-y-3 p-4">
        <div className="space-y-1 text-sm">
          {showMerchant && merchant ? (
            <p className="flex items-center gap-2 font-medium text-slate-900">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: merchant.color }} />
              {merchant.name}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-2 text-slate-700">
            <Icon name="user" className="h-4 w-4 text-slate-400" />
            {order.customerName ?? <Badge tone="slate">Walk-in</Badge>}
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
              <p className="shrink-0 text-slate-700">{formatCurrency(line.total)}</p>
            </li>
          ))}
        </ul>

        {order.notes ? <p className="text-xs text-slate-500">Note: {order.notes}</p> : null}
      </div>

      <footer className="space-y-3 border-t border-slate-100 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-slate-500">
            {order.status === 'delivered' ? 'Collected' : 'To collect'} · {TERMS_LABEL[order.terms]}
          </span>
          <span className="text-lg font-semibold text-slate-900">{formatCurrency(total)}</span>
        </div>

        {order.status === 'delivered' && order.deliveredAt ? (
          <p className="text-xs text-emerald-700">
            Paid via {order.paymentMethod} · {formatDateTime(order.deliveredAt)}
            {nameOf(order.handledBy) ? ` · ${nameOf(order.handledBy)}` : ''}
          </p>
        ) : null}

        {order.status === 'cancelled' ? (
          <p className="text-xs text-rose-700">
            Not delivered: {order.cancelReason}
            {order.cancelledAt ? ` · ${formatDateTime(order.cancelledAt)}` : ''}
          </p>
        ) : null}

        {!isStaff && order.status === 'pending' ? (
          <p className="text-xs text-slate-500">Waiting for the cashier to pack this order.</p>
        ) : null}
        {!isStaff && order.status === 'packed' ? (
          <p className="text-xs text-slate-500">
            Packed and ready. The cashier marks it delivered once payment is collected.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}

        {isStaff && (order.status === 'pending' || order.status === 'packed') ? (
          <>
            {panel === 'deliver' ? (
              <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-sm font-medium text-emerald-900">
                  Collect {formatCurrency(total)} from the customer
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
                    className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Payment received · Delivered
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : null}

            {panel === 'cancel' ? (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-sm font-medium text-rose-900">Why was it not delivered?</p>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-label="Reason"
                  className={inputClass(false)}
                >
                  {CANCEL_REASONS.map((option) => (
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
                  The reserved stock goes back to the merchant. No sale is recorded.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => finish(cancelOrder(user, order.id, finalReason))}
                    className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500"
                  >
                    Confirm not delivered
                  </button>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
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
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                  >
                    <Icon name="box" className="h-4 w-4" />
                    Mark packed
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setPanel('deliver');
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    <Icon name="truck" className="h-4 w-4" />
                    Mark delivered
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPanel('cancel');
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Not delivered
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </footer>
    </article>
  );
}
