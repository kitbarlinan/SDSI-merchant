'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatDate } from '@/lib/format';
import { STATUS_LABEL, sortNewestFirst, sponsorCommission } from '@/lib/orders';
import type { Order } from '@/lib/types';

/** A reseller who brought other resellers in sees the unilevel commission earned on their purchases. */
export function SponsorCommissionCard({ sponsorId, orders }: { sponsorId: string; orders: Order[] }) {
  const { earned, pending, orders: mine } = useMemo(() => sponsorCommission(orders, sponsorId), [orders, sponsorId]);
  const rows = useMemo(() => sortNewestFirst(mine).slice(0, 8), [mine]);

  return (
    <Card title="Unilevel commission" subtitle="Earned on the delivered orders of the resellers you brought in. It counts once the order is delivered.">
      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-xs text-slate-500">Earned (delivered)</p>
          <p className="text-xl font-semibold text-emerald-700">{formatCurrency(earned)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">On the way (not delivered yet)</p>
          <p className="text-xl font-semibold text-slate-700">{formatCurrency(pending)}</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No orders from your group yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm">
          {rows.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-mono text-xs">{order.id}</span> · {order.customerName}
                <span className="ml-2 text-xs text-slate-500">
                  {STATUS_LABEL[order.status]} · {formatDate(order.createdAt.slice(0, 10))}
                </span>
              </span>
              <span className="font-semibold text-emerald-700">{formatCurrency(order.commissionPhp ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
