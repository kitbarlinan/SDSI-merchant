export const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  unitCost: number;
  unitPrice: number;
  stock: number;
  /** At or below this quantity the item is flagged as Low Stock. */
  reorderLevel: number;
}

export interface Sale {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  itemId: string;
  itemName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  /** Unit cost snapshot at the time of sale, so COGS stays accurate if costs change later. */
  unitCost: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerName: string;
}

export interface SaleInput {
  itemId: string;
  quantity: number;
  unitPrice: number;
  paymentMethod: PaymentMethod;
  customerName: string;
  date: string;
}

export type StockStatus = 'ok' | 'low' | 'out';
