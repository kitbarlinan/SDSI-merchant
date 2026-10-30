'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { inputClass } from '@/components/ui/Field';
import { orderAmountLabel } from '@/lib/orders';
import { formatDateTime } from '@/lib/format';
import type { ReversalRequest } from '@/lib/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { ReceiptRow } from '@/components/inventory/ReceivingPanel';
import { Card } from '@/components/ui/Card';
import { MerchantFilter } from '@/components/ui/MerchantFilter';
import { formatNumber } from '@/lib/format';
import { useAppData } from '@/lib/store';

function ReversalRow({ request }: { request: ReversalRequest }) {
  const { user } = useAuth();
  const { orders, merchants, users, approveReversal, rejectReversal } = useAppData();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const order = orders.find((candidate) => candidate.id === request.orderId);
  const merchant = merchants.find((candidate) => candidate.id === request.merchantId);
  const nameOf = (id?: string) => users.find((candidate) => candidate.id === id)?.name ?? id;
  if (!user || !order) return null;
  const pending = request.status === 'pending';

  return (
    <li className="space-y-2 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">
            <span className="font-mono">{order.id}</span> · {order.customerName ?? 'Walk-in client'} ·{' '}
            {orderAmountLabel(order)}
          </p>
          <p className="text-xs text-slate-500">
            {merchant?.name} · {order.terms} · {request.id} · undo “{request.fromStatus === 'rts' ? 'RTS' : request.fromStatus === 'cancelled' ? 'not delivered' : request.fromStatus}” · requested by {nameOf(request.requestedBy)},{' '}
            {formatDateTime(request.requestedAt)}
          </p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            pending
              ? 'bg-amber-100 text-amber-800'
              : request.status === 'approved'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-700'
          }`}
        >
          {pending ? 'Waiting' : request.status === 'approved' ? 'Approved' : 'Rejected'}
        </span>
      </div>
      <p className="rounded-lg bg-slate-50 p-2.5 text-slate-800">
        <span className="text-xs font-semibold uppercase text-slate-500">Cashier&apos;s note </span>
        {request.note}
      </p>
      {!pending ? (
        <p className="text-xs text-slate-500">
          {request.status === 'approved' ? 'Approved' : 'Rejected'} by {nameOf(request.decidedBy)}
          {request.decidedAt ? `, ${formatDateTime(request.decidedAt)}` : ''}
          {request.decisionNote ? ` · ${request.decisionNote}` : ''}
        </p>
      ) : rejecting ? (
        <div className="space-y-2">
          <input
            type="text"
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is it rejected? (required)"
            className={inputClass(false)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const result = rejectReversal(user, request.id, reason);
                if (!result.ok) setError(result.error);
              }}
              className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500"
            >
              Confirm reject
            </button>
            <button type="button" onClick={() => setRejecting(false)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const result = approveReversal(user, request.id);
              if (!result.ok) setError(result.error);
            }}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Approve undo
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Reject
          </button>
          <span className="text-xs text-slate-500">
            Approving puts the order back to {order.source === 'walk-in' ? 'voided' : order.terms === 'COD' ? 'Shipped' : 'Packed'}
            {order.terms !== 'COD' ? ' and returns the stock' : ''}.
          </span>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ApprovalsView() {
  const { receipts, merchants, reversals } = useAppData();
  const [merchantId, setMerchantId] = useState('all');

  const scoped = useMemo(
    () => (merchantId === 'all' ? receipts : receipts.filter((r) => r.merchantId === merchantId)),
    [receipts, merchantId],
  );
  const pending = scoped.filter((r) => r.status === 'pending');
  const decided = scoped.filter((r) => r.status !== 'pending').slice(0, 30);
  const reversalScoped = merchantId === 'all' ? reversals : reversals.filter((r) => r.merchantId === merchantId);
  const reversalPending = reversalScoped.filter((r) => r.status === 'pending');
  const reversalDecided = reversalScoped.filter((r) => r.status !== 'pending').slice(0, 15);

  return (
    <div className="space-y-6">
      <PageHeader
        title="For Approval"
        description="Stock received by the cashier, and returns (RTS), only reach the shelf after Admin or Inventory Clerk approves."
      />
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <MerchantFilter merchants={merchants} value={merchantId} onChange={setMerchantId} />
      </div>

      <Card
        flush
        title="Undo requests"
        subtitle={`${formatNumber(reversalPending.length)} waiting · the cashier must give a note`}
      >
        {reversalPending.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No undo requests.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reversalPending.map((request) => (
              <ReversalRow key={request.id} request={request} />
            ))}
          </ul>
        )}
      </Card>

      <Card
        flush
        title="Stock receipts waiting for your approval"
        subtitle={`${formatNumber(pending.length)} receipt${pending.length === 1 ? '' : 's'}`}
      >
        {pending.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">All clear. Nothing to approve.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((r) => (
              <ReceiptRow key={r.id} receipt={r} merchantFilter={merchantId} />
            ))}
          </ul>
        )}
      </Card>

      {reversalDecided.length > 0 ? (
        <Card flush title="Recent undo decisions">
          <ul className="divide-y divide-slate-100">
            {reversalDecided.map((request) => (
              <ReversalRow key={request.id} request={request} />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card flush title="Recent receipt decisions" subtitle="Latest approved and rejected">
        {decided.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No decisions yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {decided.map((r) => (
              <ReceiptRow key={r.id} receipt={r} merchantFilter={merchantId} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
