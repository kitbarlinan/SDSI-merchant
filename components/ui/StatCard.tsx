import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';

function DeltaBadge({
  delta,
  invert,
  onPrimary,
}: {
  delta: number | null;
  invert: boolean;
  onPrimary: boolean;
}) {
  const base = 'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold';

  if (delta === null) {
    return (
      <span className={`${base} ${onPrimary ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
        new
      </span>
    );
  }

  const up = delta > 0.05;
  const down = delta < -0.05;
  const good = invert ? down : up;
  const bad = invert ? up : down;

  const tone = onPrimary
    ? 'bg-white/20 text-white'
    : good
      ? 'bg-emerald-50 text-emerald-700'
      : bad
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-100 text-slate-600';

  return (
    <span className={`${base} ${tone}`}>
      {up ? <Icon name="arrowUp" className="h-3 w-3" /> : null}
      {down ? <Icon name="arrowDown" className="h-3 w-3" /> : null}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  variant = 'default',
  delta,
  invertDelta = false,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon?: IconName;
  variant?: 'default' | 'primary';
  /** Percent change vs. the previous period. undefined hides the badge, null shows "new". */
  delta?: number | null;
  /** For costs: an increase is bad and a decrease is good. */
  invertDelta?: boolean;
}) {
  const primary = variant === 'primary';

  return (
    <div
      className={`rounded-2xl p-5 shadow-sm ${
        primary
          ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white'
          : 'border border-slate-200/80 bg-white'
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-sm font-medium ${primary ? 'text-emerald-50' : 'text-slate-500'}`}>
          {label}
        </p>
        {icon ? (
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              primary ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            <Icon name={icon} className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <p
        className={`mt-3 text-2xl font-semibold tracking-tight ${primary ? 'text-white' : 'text-slate-900'}`}
      >
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== undefined ? (
          <DeltaBadge delta={delta} invert={invertDelta} onPrimary={primary} />
        ) : null}
        {hint ? (
          <span className={`text-xs ${primary ? 'text-emerald-50/90' : 'text-slate-500'}`}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
