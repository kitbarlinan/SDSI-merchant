export type PeriodKey = '7d' | '30d' | '90d' | 'all';

export const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

export interface Range {
  /** null means "from the beginning" */
  start: string | null;
  end: string;
}

const DAY_MS = 86_400_000;

function toUTC(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export const addDays = (iso: string, days: number): string => fromUTC(toUTC(iso) + days * DAY_MS);

export const diffDays = (from: string, to: string): number =>
  Math.round((toUTC(to) - toUTC(from)) / DAY_MS);

export const weekdayOf = (iso: string): number => new Date(toUTC(iso)).getUTCDay();

export function currentRange(period: PeriodKey, today: string): Range {
  const days = PERIODS.find((option) => option.key === period)?.days ?? null;
  return days === null ? { start: null, end: today } : { start: addDays(today, -(days - 1)), end: today };
}

/** The equally long window right before the current one. null for "all time". */
export function previousRange(period: PeriodKey, today: string): Range | null {
  const current = currentRange(period, today);
  if (current.start === null) return null;
  const length = diffDays(current.start, current.end) + 1;
  return { start: addDays(current.start, -length), end: addDays(current.start, -1) };
}

export const inRange = (date: string, range: Range): boolean =>
  (range.start === null || date >= range.start) && date <= range.end;

export function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** A concrete day-by-day window (both ends included). */
export interface DayRange {
  start: string;
  end: string;
}

/** The equally long window right before the given one. */
export function previousOf(range: DayRange): DayRange {
  const length = diffDays(range.start, range.end) + 1;
  return { start: addDays(range.start, -length), end: addDays(range.start, -1) };
}

/**
 * The window a trend chart should draw. One or two days make a poor chart, so short ranges
 * are padded back to 14 days ending on the same last day.
 */
export function trendWindow(range: DayRange): DayRange & { padded: boolean } {
  const length = diffDays(range.start, range.end) + 1;
  return length < 7
    ? { start: addDays(range.end, -13), end: range.end, padded: true }
    : { ...range, padded: false };
}
