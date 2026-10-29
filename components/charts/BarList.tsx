export interface BarItem {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Text shown on the right, already formatted. */
  display: string;
  color?: string;
}

export function BarList({
  items,
  emptyText = 'No sales in this period.',
}: {
  items: BarItem[];
  emptyText?: string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{item.label}</p>
              {item.sublabel ? <p className="truncate text-xs text-slate-500">{item.sublabel}</p> : null}
            </div>
            <p className="shrink-0 text-sm font-semibold text-slate-900">{item.display}</p>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color ?? '#10b981',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
