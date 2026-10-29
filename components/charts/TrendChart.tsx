'use client';

import { useId, useState, type PointerEvent } from 'react';
import { formatCompactPeso, formatCurrency, formatShortDate } from '@/lib/format';
import type { TrendPoint } from '@/lib/reports';
import { PROFIT_COLOR, REVENUE_COLOR, TOP_UP_COLOR } from '@/lib/theme';

export type TrendMetric = 'revenue' | 'profit' | 'topUp';

const METRIC: Record<TrendMetric, { label: string; color: string }> = {
  revenue: { label: 'Sales', color: REVENUE_COLOR },
  profit: { label: 'Gross profit', color: PROFIT_COLOR },
  topUp: { label: 'SDSI top-up', color: TOP_UP_COLOR },
};

const WIDTH = 720;
const HEIGHT = 280;
const PAD = { left: 56, right: 16, top: 16, bottom: 30 };

const NICE_STEPS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10];

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = NICE_STEPS.find((candidate) => normalized <= candidate) ?? 10;
  return step * magnitude;
}

export function TrendChart({
  data,
  primary = 'revenue',
  secondary,
}: {
  data: TrendPoint[];
  primary?: TrendMetric;
  secondary?: TrendMetric;
}) {
  const main = METRIC[primary];
  const second = secondary ? METRIC[secondary] : null;
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = `rev-${useId().replace(/:/g, '')}`;

  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-500">No sales in this period.</p>;
  }

  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const baseline = PAD.top + innerHeight;
  const max = niceMax(Math.max(...data.map((point) => point[primary]), ...(secondary ? data.map((point) => point[secondary]) : []), 1));

  const x = (index: number) =>
    PAD.left + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
  const y = (value: number) => PAD.top + innerHeight - (value / max) * innerHeight;

  const path = (pick: (point: TrendPoint) => number) =>
    data
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(pick(point)).toFixed(1)}`)
      .join(' ');

  const areaPath = `${path((point) => point[primary])} L${x(data.length - 1).toFixed(1)} ${baseline} L${x(0).toFixed(1)} ${baseline} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);

  const labelCount = Math.min(5, data.length);
  const labelIndexes = [
    ...new Set(
      Array.from({ length: labelCount }, (_, k) =>
        labelCount === 1 ? 0 : Math.round((k * (data.length - 1)) / (labelCount - 1)),
      ),
    ),
  ];

  function handleMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.round(((px - PAD.left) / innerWidth) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, index)));
  }

  const active = hover !== null ? data[hover] : null;
  const tooltipLeft = hover !== null ? Math.min(86, Math.max(14, (x(hover) / WIDTH) * 100)) : 0;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: main.color }} />
          {main.label}
        </span>
        {second ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: second.color }} />
            {second.label}
          </span>
        ) : null}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto w-full touch-pan-y"
          role="img"
          aria-label={`${main.label} over time`}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={main.color} stopOpacity="0.3" />
              <stop offset="100%" stopColor={main.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="#e2e8f0"
                strokeDasharray={value === 0 ? undefined : '3 4'}
              />
              <text
                x={PAD.left - 8}
                y={y(value) + 4}
                textAnchor="end"
                fontSize="11"
                fill="#64748b"
              >
                {formatCompactPeso(value)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={path((point) => point[primary])}
            fill="none"
            stroke={main.color}
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {secondary && second ? (
            <path
              d={path((point) => point[secondary])}
              fill="none"
              stroke={second.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {labelIndexes.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={HEIGHT - 8}
              fontSize="11"
              fill="#64748b"
              textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}
            >
              {formatShortDate(data[index].date)}
            </text>
          ))}

          {hover !== null && active ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={baseline} stroke="#94a3b8" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(active[primary])} r="4.5" fill="#fff" stroke={main.color} strokeWidth="2.5" />
              {secondary && second ? (
                <circle cx={x(hover)} cy={y(active[secondary])} r="4" fill="#fff" stroke={second.color} strokeWidth="2.5" />
              ) : null}
            </g>
          ) : null}
        </svg>

        {active && hover !== null ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-lg"
            style={{ left: `${tooltipLeft}%` }}
          >
            <p className="mb-1.5 font-semibold text-slate-900">
              {active.date === active.endDate
                ? formatShortDate(active.date)
                : `${formatShortDate(active.date)} – ${formatShortDate(active.endDate)}`}
            </p>
            <p className="flex justify-between text-slate-600">
              <span>{main.label}</span>
              <span className="font-medium text-slate-900">{formatCurrency(active[primary])}</span>
            </p>
            {secondary && second ? (
              <p className="flex justify-between text-slate-600">
                <span>{second.label}</span>
                <span className="font-medium text-slate-900">{formatCurrency(active[secondary])}</span>
              </p>
            ) : null}
            <p className="flex justify-between text-slate-600">
              <span>Orders</span>
              <span className="font-medium text-slate-900">{active.orders}</span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
