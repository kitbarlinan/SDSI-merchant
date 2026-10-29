const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
});

const numberFormatter = new Intl.NumberFormat('en-PH');

export const formatCurrency = (value: number): string => pesoFormatter.format(value);

export const formatNumber = (value: number): string => numberFormatter.format(value);

export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

/** Avoids a floating point drift like 0.1 + 0.2. */
export const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/** Formats a YYYY-MM-DD string without any timezone shifting. */
export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Today's date in the user's local timezone, as YYYY-MM-DD. */
export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
