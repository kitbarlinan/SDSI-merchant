import type { ReactNode } from 'react';

const ACCENTS = {
  indigo: 'text-indigo-600',
  amber: 'text-amber-600',
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
  slate: 'text-slate-900',
} as const;

export function StatCard({
  label,
  value,
  hint,
  accent = 'slate',
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  accent?: keyof typeof ACCENTS;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${ACCENTS[accent]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
