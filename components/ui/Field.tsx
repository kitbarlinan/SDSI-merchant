import type { ReactNode } from 'react';

export function inputClass(hasError: boolean): string {
  return [
    'block w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2',
    hasError
      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
      : 'border-slate-300 focus:border-emerald-500 focus:ring-emerald-200',
  ].join(' ');
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
