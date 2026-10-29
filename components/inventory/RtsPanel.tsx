'use client';

import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { MOCK_TODAY } from '@/lib/mock-data';
import { orderTotal } from '@/lib/orders';
import { useAppData } from '@/lib/store';
import type { Order } from '@/lib/types';
import { useToday } from '@/lib/use-today';

function RtsRow({ order }: { order: Order }) {
  const { user } = useAuth();
  const { merchants, receipts, receiveReturn } = useAppData();
  const today = useToday() || MOCK_TODAY;
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const merchant = merchants.find((m) => m.id === order.merchantId);
  const receipt = receipts.find((r) => r.id === order.returnReceiptId);

  const receive = () => {
    const result = receiveReturn(user, { orderId: order.id, receivedDate: date || today, note });
    if (!result.ok) setError(result.error);
    else setError(null);
  };

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="font-mono">{order.id}</span>
            {order.waybill ? (
              <span className="font-mono text-xs font-normal text-violet-700">{order.waybill}</span>
            ) : null}
            {!receipt ? (
              <Badge tone="amber">To receive back</Badge>
            ) : receipt.status === 'approved' ? (
              <Badge tone="green">Back in stock</Badge>
            ) : (
              <Badge tone="sky">Awaiting approval</Badge>
            )}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            {merchant ? (
              <>
                <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                {merchant.name} ·{' '}
              </>
            ) : null}
            {order.customerName} · {formatCurrency(orderTotal(order))}
          </p>
        </div>
        <p className="text-right text-xs text-rose-700">
          {order.rtsReason}
          {order.rtsAt ? ` · ${formatDateTime(order.rtsAt)}` : ''}
        </p>
      </div>

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-slate-50/60 text-sm">
        {order.lines.map((line) => (
          <li key={line.itemId} className="flex justify-between gap-3 px-3 py-2">
            <span className="min-w-0 truncate text-slate-800">{line.name}</span>
            <span className="shrink-0 font-semibold">{formatNumber(line.quantity)}</span>
          </li>
        ))}
      </ul>

      {receipt ? (
        <p className="text-xs text-slate-500">
          {receipt.id} · received {formatDate(receipt.receivedDate)}
          {receipt.status === 'approved'
            ? ' · returned to stock'
            : ' · stock is added once the admin or inventory clerk approves'}
        </p>
      ) : user.role === 'cashier' ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-500">
            Date received back
            <input
              type="date"
              value={date || today}
              max={today}
              onChange={(event) => setDate(event.target.value)}
              className={`mt-1 block ${inputClass(false)}`}
            />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs font-medium text-slate-500">
            Note (optional)
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. box intact"
              className={`mt-1 block ${inputClass(false)}`}
            />
          </label>
          <button
            type="button"
            onClick={receive}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <Icon name="box" className="h-4 w-4" />
            Receive back
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">The cashier receives the returned parcel.</p>
      )}
      {error ? (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function RtsPanel({ merchantFilter }: { merchantFilter: string }) {
  const { user } = useAuth();
  const { orders } = useAppData();

  const rows = useMemo(() => {
    if (!user) return [];
    const scoped = orders.filter((order) => {
      if (order.status !== 'rts') return false;
      if (user.role === 'merchant') return order.merchantId === user.merchantId;
      return merchantFilter === 'all' || order.merchantId === merchantFilter;
    });
    // Parcels still to be received come first, then newest.
    return scoped.sort((a, b) => {
      const pa = a.returnReceiptId ? 1 : 0;
      const pb = b.returnReceiptId ? 1 : 0;
      return pa - pb || (b.rtsAt ?? '').localeCompare(a.rtsAt ?? '');
    });
  }, [orders, user, merchantFilter]);

  const toReceive = rows.filter((order) => !order.returnReceiptId).length;

  return (
    <Card
      flush
      title="Returned to sender"
      subtitle={`${formatNumber(toReceive)} parcel${toReceive === 1 ? '' : 's'} waiting to be received back`}
    >
      {rows.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-slate-500">No RTS orders.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((order) => (
            <RtsRow key={order.id} order={order} />
          ))}
        </ul>
      )}
    </Card>
  );
}
