import { formatCurrency, formatPercent } from '@/lib/format';

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  slices,
  centerLabel,
  centerValue,
  format = formatCurrency,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  centerValue: string;
  format?: (value: number) => string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return <p className="py-12 text-center text-sm text-slate-500">No sales in this period.</p>;
  }

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 42 42" className="h-full w-full -rotate-90" role="img" aria-label={centerLabel}>
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="5" />
          {slices.map((slice) => {
            const percent = (slice.value / total) * 100;
            const circle = (
              <circle
                key={slice.label}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={slice.color}
                strokeWidth="5"
                strokeDasharray={`${Math.max(percent - 0.6, 0)} ${100 - Math.max(percent - 0.6, 0)}`}
                strokeDashoffset={-offset}
              />
            );
            offset += percent;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            {centerLabel}
          </span>
          <span className="text-base font-semibold text-slate-900">{centerValue}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{slice.label}</span>
            <span className="shrink-0 font-medium text-slate-900">{format(slice.value)}</span>
            <span className="w-12 shrink-0 text-right text-xs text-slate-500">
              {formatPercent((slice.value / total) * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
