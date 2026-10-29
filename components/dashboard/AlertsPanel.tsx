'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { COVER_WARNING_DAYS } from '@/lib/brand';
import { formatShortDate } from '@/lib/format';
import { coverDays, getExpiry, getStockStatus, needsReorder, recentUnitsByItem } from '@/lib/inventory';
import type { InventoryItem, Merchant, SaleLine } from '@/lib/types';

interface Row {
  id: string;
  name: string;
  owner?: string;
  detail: string;
  tone: 'red' | 'amber';
}

function Group({ title, count, rows }: { title: string; count: number; rows: Row[] }) {
  if (count === 0) return null;
  return (
    <div>
      <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{count}</span>
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-800">
              {row.name}
              {row.owner ? <span className="text-xs text-slate-500"> · {row.owner}</span> : null}
            </span>
            <span
              className={`shrink-0 text-xs font-medium ${row.tone === 'red' ? 'text-rose-600' : 'text-amber-700'}`}
            >
              {row.detail}
            </span>
          </li>
        ))}
      </ul>
      {count > rows.length ? (
        <p className="mt-1.5 text-xs text-slate-500">+{count - rows.length} more</p>
      ) : null}
    </div>
  );
}

export function AlertsPanel({
  items,
  sales,
  today,
  merchants,
}: {
  items: InventoryItem[];
  sales: SaleLine[];
  today: string;
  /** Pass for staff views so each alert shows which merchant owns the product. */
  merchants?: Merchant[];
}) {
  const groups = useMemo(() => {
    const units = recentUnitsByItem(sales, today);

    const stock = items
      .filter((item) => getStockStatus(item) !== 'ok')
      .sort((a, b) => a.stock - b.stock);

    const expiring = today
      ? items
          .map((item) => ({ item, expiry: getExpiry(item, today) }))
          .filter(({ expiry }) => expiry.status !== 'ok')
          .sort((a, b) => a.expiry.daysLeft - b.expiry.daysLeft)
      : [];

    const reorder = today
      ? items
          .map((item) => ({ item, cover: coverDays(item.stock, units.get(item.id) ?? 0) }))
          .filter(({ item, cover }) => needsReorder(cover) && getStockStatus(item) === 'ok')
          .sort((a, b) => (a.cover ?? 0) - (b.cover ?? 0))
      : [];

    return { stock, expiring, reorder };
  }, [items, sales, today]);

  const ownerOf = (item: InventoryItem) => merchants?.find((m) => m.id === item.merchantId)?.name;
  const total = groups.stock.length + groups.expiring.length + groups.reorder.length;

  const body: ReactNode =
    total === 0 ? (
      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
        <Icon name="check" className="h-5 w-5 shrink-0 text-emerald-600" />
        Stock levels, expiry dates and cover all look healthy.
      </div>
    ) : (
      <div className="space-y-5">
        <Group
          title="Low or out of stock"
          count={groups.stock.length}
          rows={groups.stock.slice(0, 4).map((item) => ({
            id: item.id,
            name: item.name,
            owner: ownerOf(item),
            detail: item.stock === 0 ? 'Out of stock' : `${item.stock} left`,
            tone: item.stock === 0 ? 'red' : 'amber',
          }))}
        />
        <Group
          title="Expiring soon"
          count={groups.expiring.length}
          rows={groups.expiring.slice(0, 4).map(({ item, expiry }) => ({
            id: item.id,
            name: item.name,
            owner: ownerOf(item),
            detail:
              expiry.status === 'expired'
                ? 'Expired'
                : `${formatShortDate(item.expiryDate)} · ${expiry.daysLeft}d`,
            tone: expiry.status === 'expired' || expiry.daysLeft <= 30 ? 'red' : 'amber',
          }))}
        />
        <Group
          title={`Running low (under ${COVER_WARNING_DAYS} days of cover)`}
          count={groups.reorder.length}
          rows={groups.reorder.slice(0, 4).map(({ item, cover }) => ({
            id: item.id,
            name: item.name,
            owner: ownerOf(item),
            detail: `${cover ?? 0} days left`,
            tone: (cover ?? 0) < 14 ? 'red' : 'amber',
          }))}
        />
      </div>
    );

  return (
    <Card
      title="Inventory alerts"
      subtitle="Stock, expiry and days of cover"
      action={
        <Link href="/inventory" className="text-xs font-medium text-emerald-700 hover:underline">
          Open inventory
        </Link>
      }
    >
      {body}
    </Card>
  );
}
