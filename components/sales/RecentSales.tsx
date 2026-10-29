'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/format';
import { sortLedger } from '@/lib/reports';
import { useMerchant } from '@/lib/store';

export function RecentSales() {
  const { sales } = useMerchant();
  const recent = sortLedger(sales).slice(0, 6);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <h2 className="text-base font-semibold">Recent sales</h2>
        <Link href="/reports" className="text-sm font-medium text-indigo-600 hover:underline">
          View ledger
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">No sales recorded yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {recent.map((sale) => (
            <li key={sale.id} className="flex items-start justify-between gap-3 px-6 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {sale.quantity} × {sale.itemName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  {sale.customerName} · {formatDate(sale.date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold">{formatCurrency(sale.total)}</p>
                <div className="mt-1">
                  <Badge tone="indigo">{sale.paymentMethod}</Badge>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
