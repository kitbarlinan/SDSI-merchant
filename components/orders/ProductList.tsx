'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatHkd, formatNumber, roundMoney } from '@/lib/format';
import type { InventoryItem, Merchant } from '@/lib/types';

export interface ListRow {
  item: InventoryItem;
  /** How many can still be ordered. */
  available: number;
  expired: boolean;
  /** Live price of one piece of this SKU, HKD. */
  pickupHkd: number;
}

export interface ParsedQuantities {
  lines: { item: InventoryItem; quantity: number }[];
  /** Sum of the live pickup prices, HKD. */
  totalHkd: number;
  /** Error text per item id. */
  errors: Record<string, string>;
}

/** Turns what was typed in the qty boxes into order lines, with a message for any bad box. */
export function parseQuantities(rows: ListRow[], typed: Record<string, string>): ParsedQuantities {
  const lines: ParsedQuantities['lines'] = [];
  const errors: Record<string, string> = {};
  let totalHkd = 0;
  for (const { item, available, expired, pickupHkd } of rows) {
    const raw = (typed[item.id] ?? '').trim();
    if (raw === '') continue;
    const quantity = Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0) errors[item.id] = 'Whole number only.';
    else if (quantity > 0 && expired) errors[item.id] = 'Expired.';
    else if (quantity > available) errors[item.id] = `Only ${formatNumber(available)} available.`;
    else if (quantity > 0) {
      lines.push({ item, quantity });
      totalHkd += quantity * pickupHkd;
    }
  }
  return { lines, totalHkd: roundMoney(totalHkd), errors };
}

const COLUMNS = 'md:grid md:grid-cols-[2.5rem_8.5rem_1fr_6rem_5.5rem_6.5rem_7rem] md:items-center md:gap-3';

/**
 * Product list with a quantity box on every row: # / item code / item / price / available / qty / amount.
 * Same idea as the "Shop for Customer" screen staff already know, minus the points columns.
 */
export function ProductList({
  rows,
  merchants,
  typed,
  onChange,
  errors,
  showMerchant = false,
  footer,
}: {
  rows: ListRow[];
  merchants: Merchant[];
  typed: Record<string, string>;
  onChange: (itemId: string, value: string) => void;
  errors: Record<string, string>;
  /** Show which merchant owns each product (staff views). */
  showMerchant?: boolean;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [merchantId, setMerchantId] = useState('all');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .map((row, index) => ({ ...row, number: index + 1 }))
      .filter(({ item }) => {
        if (merchantId !== 'all' && item.merchantId !== merchantId) return false;
        return !needle || item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle);
      });
  }, [rows, query, merchantId]);

  const picked = rows.filter(({ item }) => Number(typed[item.id] || 0) > 0).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-900">
          Products{' '}
          <span className="font-normal text-slate-500">
            {picked > 0 ? `· ${picked} selected` : `· ${rows.length} items`}
          </span>
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {showMerchant ? (
            <select
              value={merchantId}
              onChange={(event) => setMerchantId(event.target.value)}
              aria-label="Filter by merchant"
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            >
              <option value="all">All merchants</option>
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.name}
                </option>
              ))}
            </select>
          ) : null}
          <label className="relative block">
            <span className="sr-only">Search product</span>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search product here..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200 sm:w-60"
            />
          </label>
        </div>
      </div>

      <div className={`hidden bg-emerald-700 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-white ${COLUMNS}`}>
        <span>#</span>
        <span>Item code</span>
        <span>Item</span>
        <span className="text-right">Price (HKD)</span>
        <span className="text-right">Available</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Amount</span>
      </div>

      <ul className="divide-y divide-slate-100">
        {visible.length === 0 ? (
          <li className="px-4 py-10 text-center text-sm text-slate-500">No products match your search.</li>
        ) : (
          visible.map(({ item, available, expired, number, pickupHkd }) => {
            const raw = typed[item.id] ?? '';
            const quantity = Number(raw);
            const error = errors[item.id];
            const disabled = available <= 0 || expired;
            const merchant = merchants.find((m) => m.id === item.merchantId);
            const amount = Number.isInteger(quantity) && quantity > 0 && !error ? quantity * pickupHkd : 0;
            return (
              <li key={item.id} className={`px-4 py-3 ${COLUMNS} ${disabled ? 'bg-slate-50/60' : ''}`}>
                <span className="hidden text-sm text-slate-500 md:block">{number}</span>
                <span className="hidden font-mono text-xs text-slate-600 md:block">{item.sku}</span>

                <div className="min-w-0">
                  <p className={`text-sm font-medium ${disabled ? 'text-slate-500' : 'text-slate-900'}`}>
                    {item.name}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 md:hidden">
                    <span className="font-mono">{item.sku}</span>
                    <span>{formatHkd(pickupHkd)}</span>
                  </p>
                  {showMerchant && merchant ? (
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="h-2 w-2 rounded-full" style={{ background: merchant.color }} />
                      {merchant.name}
                    </p>
                  ) : null}
                  {error ? (
                    <p role="alert" className="mt-0.5 text-xs text-rose-600">
                      {error}
                    </p>
                  ) : null}
                </div>

                <span className="hidden text-right text-sm md:block">{formatHkd(pickupHkd)}</span>
                <span
                  className={`mt-1 block text-xs md:mt-0 md:text-right md:text-sm ${
                    disabled ? 'font-medium text-rose-600' : 'text-slate-600'
                  }`}
                >
                  {expired ? 'Expired' : available <= 0 ? 'Out of stock' : `${formatNumber(available)} available`}
                </span>

                <div className="mt-2 flex items-center justify-between gap-3 md:mt-0 md:block">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    disabled={disabled}
                    value={raw}
                    onChange={(event) => onChange(item.id, event.target.value)}
                    aria-label={`Quantity of ${item.name}`}
                    aria-invalid={Boolean(error)}
                    className={`w-24 rounded-lg border px-2 py-1.5 text-center text-sm focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 md:w-full ${
                      error
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200'
                    }`}
                  />
                  <span className="text-sm font-semibold text-slate-900 md:hidden">
                    {amount > 0 ? formatHkd(amount) : ''}
                  </span>
                </div>

                <span className="hidden text-right text-sm font-semibold text-slate-900 md:block">
                  {amount > 0 ? formatHkd(amount) : ''}
                </span>
              </li>
            );
          })
        )}
      </ul>

      {footer ? <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-4">{footer}</div> : null}
    </div>
  );
}
