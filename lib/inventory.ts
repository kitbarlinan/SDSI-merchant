import { COVER_WARNING_DAYS, EXPIRY_WARNING_DAYS } from './brand';
import { addDays, diffDays } from './period';
import { LEGACY_BRANCH, type BranchId, type InventoryItem, type SaleLine, type StockStatus } from './types';

export function getStockStatus(item: InventoryItem): StockStatus {
  if (item.stock <= 0) return 'out';
  if (item.stock <= item.reorderLevel) return 'low';
  return 'ok';
}

/** Units of an item on one branch's shelf. */
export const stockAt = (item: InventoryItem, branch: BranchId): number =>
  item.branchStock?.[branch] ?? (branch === LEGACY_BRANCH ? item.stock : 0);

/** Moves stock on one branch (sign +1 in, -1 out), keeping the total in step. */
export function moveStock(items: InventoryItem[], branch: BranchId, qty: Map<string, number>, sign: 1 | -1): InventoryItem[] {
  return items.map((item) => {
    const amount = qty.get(item.id);
    if (amount === undefined) return item;
    const delta = sign * amount;
    const split = {
      'shueng-wan': stockAt(item, 'shueng-wan'),
      central: stockAt(item, 'central'),
    } as Record<BranchId, number>;
    split[branch] += delta;
    return { ...item, stock: item.stock + delta, branchStock: split };
  });
}

export function getBranchStockStatus(item: InventoryItem, branch: BranchId): StockStatus {
  const onHand = stockAt(item, branch);
  if (onHand <= 0) return 'out';
  if (onHand <= item.reorderLevel) return 'low';
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

/** Units delivered per product over the last 30 days. */
export function recentUnitsByItem(lines: SaleLine[], today: string): Map<string, number> {
  const start = addDays(today, -(COVER_WINDOW_DAYS - 1));
  const units = new Map<string, number>();
  for (const line of lines) {
    if (line.date < start || line.date > today) continue;
    units.set(line.itemId, (units.get(line.itemId) ?? 0) + line.quantity);
  }
  return units;
}

/** How many days the current stock lasts at the recent pace. null = no recent sales. */
export function coverDays(stock: number, recentUnits: number): number | null {
  if (recentUnits <= 0) return null;
  return Math.floor(stock / (recentUnits / COVER_WINDOW_DAYS));
}

/** True when stock would run out soon at the current pace. */
export function needsReorder(cover: number | null): boolean {
  return cover !== null && cover < COVER_WARNING_DAYS;
}

/** "Night Cream ×5 · Kojic Soap ×5 + 1 free" for a SKU built from the master list. Empty for older SKUs. */
export function describeParts(item: Pick<InventoryItem, 'parts'>, products: { id: string; name: string }[]): string {
  return (item.parts ?? [])
    .map((part) => {
      const name = products.find((product) => product.id === part.productId)?.name ?? 'Unknown product';
      return `${name} ×${part.qty}${part.free > 0 ? ` + ${part.free} free` : ''}`;
    })
    .join(' · ');
}
