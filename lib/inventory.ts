import { EXPIRY_WARNING_DAYS, SUPPLIER_LEAD_TIME_DAYS } from './brand';
import { addDays, diffDays } from './period';
import type { InventoryItem, Sale, StockStatus } from './types';

export function getStockStatus(item: InventoryItem): StockStatus {
  if (item.stock <= 0) return 'out';
  if (item.stock <= item.reorderLevel) return 'low';
  return 'ok';
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  ok: 'In Stock',
  low: 'Low Stock',
  out: 'Out of Stock',
};

export type ExpiryStatus = 'expired' | 'soon' | 'ok';

export function getExpiry(
  item: InventoryItem,
  today: string,
): { status: ExpiryStatus; daysLeft: number } {
  const daysLeft = diffDays(today, item.expiryDate);
  const status: ExpiryStatus =
    daysLeft < 0 ? 'expired' : daysLeft <= EXPIRY_WARNING_DAYS ? 'soon' : 'ok';
  return { status, daysLeft };
}

const COVER_WINDOW_DAYS = 30;

/** Units sold per item over the last 30 days. */
export function recentUnitsByItem(sales: Sale[], today: string): Map<string, number> {
  const start = addDays(today, -(COVER_WINDOW_DAYS - 1));
  const units = new Map<string, number>();
  for (const sale of sales) {
    if (sale.date < start || sale.date > today) continue;
    units.set(sale.itemId, (units.get(sale.itemId) ?? 0) + sale.quantity);
  }
  return units;
}

/** How many days the current stock lasts at the recent sales pace. null = no recent sales. */
export function coverDays(stock: number, recentUnits: number): number | null {
  if (recentUnits <= 0) return null;
  return Math.floor(stock / (recentUnits / COVER_WINDOW_DAYS));
}

/** True when stock will run out before a new supplier order could arrive. */
export function needsReorder(cover: number | null): boolean {
  return cover !== null && cover < SUPPLIER_LEAD_TIME_DAYS;
}
