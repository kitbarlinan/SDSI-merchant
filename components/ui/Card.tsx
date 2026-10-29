import type { ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  action,
  flush = false,
  className = '',
  children,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  /** Removes body padding, for tables that should touch the card edges. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${className}`}>
      {title ? (
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={flush ? 'pt-3' : 'p-5'}>{children}</div>
    </section>
  );
}
