import type { InventoryItem, StockStatus } from './types';

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
