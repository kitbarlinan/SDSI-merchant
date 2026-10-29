'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatShortDate } from '@/lib/format';
import { sortLedger } from '@/lib/reports';
import { useMerchant } from '@/lib/store';

export function RecentSales() {
  const { sales } = useMerchant();
  const recent = sortLedger(sales).slice(0, 7);

  return (
    <Card
      flush
      title="Recent sales"
      action={
        <Link href="/reports" className="text-xs font-medium text-emerald-700 hover:underline">
          View ledger
        </Link>
      }
    >
      {recent.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-500">No sales recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recent.map((sale) => (
            <li key={sale.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {sale.quantity} × {sale.itemName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {sale.customerName} · {formatShortDate(sale.date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatCurrency(sale.total)}</p>
                <div className="mt-1 flex justify-end gap-1">
                  <Badge tone="slate">{sale.channel}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
