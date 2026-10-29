const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const numberFormatter = new Intl.NumberFormat('en-PH');

export const formatCurrency = (value: number): string => pesoFormatter.format(value);

export const formatNumber = (value: number): string => numberFormatter.format(value);

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

/** Short peso label for chart axes: ₱1.2k, ₱3.4M. */
export function formatCompactPeso(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `₱${Math.round(value / 1000)}k`;
  if (value >= 1000) return `₱${(value / 1000).toFixed(1)}k`;
  return `₱${Math.round(value)}`;
}

/** Avoids a floating point drift like 0.1 + 0.2. */
export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

function utcDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Formats a YYYY-MM-DD string without any timezone shifting. */
export function formatDate(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Oct 29" */
export function formatShortDate(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "9:05 AM" from a YYYY-MM-DDTHH:mm string. */
export function formatTime(dateTime: string): string {
  const [hours, minutes] = dateTime.slice(11, 16).split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = ((hours + 11) % 12) + 1;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

/** "Oct 29, 9:05 AM" */
export const formatDateTime = (dateTime: string): string =>
  `${formatShortDate(dateTime)}, ${formatTime(dateTime)}`;

/** Today's date in the user's local timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Current local date and time, as YYYY-MM-DDTHH:mm. */
export function nowISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const hkdFormatter = new Intl.NumberFormat('en-HK', { style: 'currency', currency: 'HKD' });
export const formatHkd = (value: number): string => hkdFormatter.format(value);
