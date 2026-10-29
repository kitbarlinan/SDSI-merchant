'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { canApprove } from '@/lib/roles';
import { useAppData } from '@/lib/store';
import type { StockReceipt } from '@/lib/types';
import { useToday } from '@/lib/use-today';

export function ReceiptRow({ receipt, merchantFilter }: { receipt: StockReceipt; merchantFilter: string }) {
  const { user } = useAuth();
  const { users, merchants, approveReceipt, rejectReceipt } = useAppData();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const merchant = merchants.find((m) => m.id === receipt.merchantId);
  const nameOf = (id?: string) => users.find((u) => u.id === id)?.name ?? '—';
  const approver = canApprove(user.role);

  const run = (result: { ok: boolean; error?: string }) => {
    if (result.ok) {
      setError(null);
      setRejecting(false);
    } else setError(result.error ?? 'Something went wrong.');
  };

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="font-mono">{receipt.id}</span>
            <Badge tone={receipt.kind === 'rts' ? 'red' : 'sky'}>
              {receipt.kind === 'rts' ? `RTS return · ${receipt.orderId}` : 'Stock in'}
            </Badge>
            <Badge tone={receipt.status === 'pending' ? 'amber' : receipt.status === 'approved' ? 'green' : 'red'}>
              {receipt.status === 'pending' ? 'Awaiting approval' : receipt.status === 'approved' ? 'Approved' : 'Rejected'}
            </Badge>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            {merchantFilter === 'all' && merchant ? (
              <>
                <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                {merchant.name} ·{' '}
              </>
            ) : null}
            Received {formatDate(receipt.receivedDate)} by {nameOf(receipt.receivedBy)}
          </p>
        </div>
        {receipt.status !== 'pending' ? (
          <p className="text-right text-xs text-slate-500">
            {receipt.status === 'approved' ? 'Approved' : 'Rejected'} by {nameOf(receipt.decidedBy)}
            {receipt.decidedAt ? ` · ${formatDateTime(receipt.decidedAt)}` : ''}
          </p>
        ) : null}
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 text-sm">
        {receipt.lines.map((line) => (
          <li key={line.itemId} className="flex justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate text-slate-800">
              {line.name} <span className="font-mono text-xs text-slate-500">{line.sku}</span>
            </span>
            <span className="shrink-0 font-semibold">+{formatNumber(line.quantity)}</span>
          </li>
        ))}
      </ul>
      {receipt.note ? <p className="text-xs text-slate-500">Note: {receipt.note}</p> : null}
      {receipt.status === 'rejected' && receipt.rejectReason ? (
        <p className="text-xs text-rose-700">Reason: {receipt.rejectReason}</p>
      ) : null}

      {receipt.status === 'pending' ? (
        approver ? (
          rejecting ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                autoFocus
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Reason for rejecting"
                className={`max-w-xs ${inputClass(false)}`}
              />
              <button
                type="button"
                onClick={() => run(rejectReceipt(user, receipt.id, reason))}
                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500"
              >
                Confirm reject
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Back
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => run(approveReceipt(user, receipt.id))}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                <Icon name="check" className="h-4 w-4" />
                Approve · add to stock
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reject
              </button>
            </div>
          )
        ) : (
          <p className="text-xs text-slate-500">Stock is added once the admin or inventory clerk approves.</p>
        )
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

function ReceiveForm() {
  const { user } = useAuth();
  const { items, merchants, receiveStock } = useAppData();
  const today = useToday() || MOCK_TODAY;

  const [merchantId, setMerchantId] = useState(merchants[0]?.id ?? '');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const catalog = useMemo(() => items.filter((item) => item.merchantId === merchantId), [items, merchantId]);
  if (!user) return null;

  const submit = () => {
    const result = receiveStock(user, {
      merchantId,
      receivedDate: date || today,
      note,
      lines: catalog.map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id] || 0) })),
    });
    if (!result.ok) {
      setError(result.error);
      setDone(null);
      return;
    }
    setError(null);
    setDone(result.value.id);
    setQuantities({});
    setNote('');
  };

  return (
    <Card
      title="Receive stock"
      subtitle="Record what the merchant delivered. It goes on the shelf once the admin or inventory clerk approves."
    >
      <div className="mt-3 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-500">
            Merchant
            <select
              value={merchantId}
              onChange={(event) => {
                setMerchantId(event.target.value);
                setQuantities({});
              }}
              className={`mt-1 ${inputClass(false)}`}
            >
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Date received
            <input
              type="date"
              value={date || today}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              className={`mt-1 ${inputClass(false)}`}
            />
          </label>
        </div>

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {catalog.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{item.name}</p>
                <p className="text-xs text-slate-500">
                  <span className="font-mono">{item.sku}</span> · on hand {formatNumber(item.stock)}
                </p>
              </div>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={quantities[item.id] ?? ''}
                onChange={(event) => setQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))}
                aria-label={`Quantity received of ${item.name}`}
                placeholder="0"
                className={`w-24 text-center ${inputClass(false)}`}
              />
            </li>
          ))}
        </ul>

        <label className="block text-xs font-medium text-slate-500">
          Note (optional)
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="e.g. delivery receipt no., condition of boxes"
            className={`mt-1 ${inputClass(false)}`}
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
            {error}
          </p>
        ) : null}
        {done ? (
          <p role="status" className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
            {done} submitted for approval.
          </p>
        ) : null}

        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          <Icon name="box" className="h-4 w-4" />
          Submit for approval
        </button>
      </div>
    </Card>
  );
}

export function ReceivingPanel({ merchantFilter }: { merchantFilter: string }) {
  const { user } = useAuth();
  const { receipts } = useAppData();

  const scoped = useMemo(() => {
    if (!user) return [];
    if (user.role === 'merchant') return receipts.filter((r) => r.merchantId === user.merchantId);
    return merchantFilter === 'all' ? receipts : receipts.filter((r) => r.merchantId === merchantFilter);
  }, [receipts, user, merchantFilter]);

  const pending = scoped.filter((r) => r.status === 'pending');
  const reviewed = scoped.filter((r) => r.status !== 'pending').slice(0, 30);

  if (!user) return null;

  return (
    <div className="space-y-6">
      {user.role === 'cashier' ? <ReceiveForm /> : null}

      <Card
        flush
        title="Awaiting approval"
        subtitle={`${formatNumber(pending.length)} receipt${pending.length === 1 ? '' : 's'} not yet on the shelf`}
      >
        {pending.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">Nothing waiting for approval.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((receipt) => (
              <ReceiptRow key={receipt.id} receipt={receipt} merchantFilter={merchantFilter} />
            ))}
          </ul>
        )}
      </Card>

      <Card flush title="Receiving history" subtitle="Latest approved and rejected receipts">
        {reviewed.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-slate-500">No history yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reviewed.map((receipt) => (
              <ReceiptRow key={receipt.id} receipt={receipt} merchantFilter={merchantFilter} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
