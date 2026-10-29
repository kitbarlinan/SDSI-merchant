'use client';

import { PERIODS, type PeriodKey } from '@/lib/period';

export function PeriodTabs({
  value,
  onChange,
}: {
  value: PeriodKey;
  onChange: (period: PeriodKey) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Time period"
      className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
    >
      {PERIODS.map((period) => {
        const active = period.key === value;
        return (
          <button
            key={period.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(period.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
              active
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
