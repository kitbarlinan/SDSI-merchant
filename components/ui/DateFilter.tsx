'use client';

import type { DayRange } from '@/lib/period';

/** From / To date pickers. Keeps the range valid: From is never after To, and nothing in the future. */
export function DateFilter({
  value,
  today,
  onChange,
}: {
  value: DayRange;
  today: string;
  onChange: (range: DayRange) => void;
}) {
  const isToday = value.start === today && value.end === today;

  const setStart = (start: string) => {
    if (!start) return;
    onChange({ start, end: start > value.end ? start : value.end });
  };
  const setEnd = (end: string) => {
    if (!end) return;
    onChange({ start: end < value.start ? end : value.start, end });
  };

  const field =
    'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200';

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-slate-500">
        From
        <input
          type="date"
          value={value.start}
          max={today}
          onChange={(event) => setStart(event.target.value)}
          className={`mt-1 block ${field}`}
        />
      </label>
      <label className="text-xs font-medium text-slate-500">
        To
        <input
          type="date"
          value={value.end}
          max={today}
          onChange={(event) => setEnd(event.target.value)}
          className={`mt-1 block ${field}`}
        />
      </label>
      <button
        type="button"
        onClick={() => onChange({ start: today, end: today })}
        aria-pressed={isToday}
        className={`rounded-xl border px-3 py-2 text-sm font-medium shadow-sm ${
          isToday
            ? 'border-emerald-600 bg-emerald-600 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        Today
      </button>
    </div>
  );
}
