'use client';

import type { Merchant } from '@/lib/types';

export function MerchantFilter({
  merchants,
  value,
  onChange,
}: {
  merchants: Merchant[];
  value: string;
  onChange: (merchantId: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-slate-500">
      Merchant
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
      >
        <option value="all">All merchants</option>
        {merchants.map((merchant) => (
          <option key={merchant.id} value={merchant.id}>
            {merchant.name}
          </option>
        ))}
      </select>
    </label>
  );
}
