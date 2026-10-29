export const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SALES_CHANNELS = [
  'Direct Sales',
  'Shopee',
  'TikTok Shop',
  'Shopify',
  'Retail Branch',
] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const CATEGORIES = [
  'Greens & Superfoods',
  'Herbal',
  'Vitamins & Minerals',
  'Beauty & Skin',
  'Heart & Wellness',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: Category;
  unitCost: number;
  unitPrice: number;
  stock: number;
  /** At or below this quantity the item is flagged as Low Stock. */
  reorderLevel: number;
  /** Product expiry, YYYY-MM-DD. */
  expiryDate: string;
}

export interface Sale {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  itemId: string;
  itemName: string;
  sku: string;
  category: Category;
  quantity: number;
  unitPrice: number;
  /** Unit cost snapshot at the time of sale, so COGS stays accurate if costs change later. */
  unitCost: number;
  total: number;
  paymentMethod: PaymentMethod;
  channel: SalesChannel;
  customerName: string;
}

export interface SaleInput {
  itemId: string;
  quantity: number;
  unitPrice: number;
  paymentMethod: PaymentMethod;
  channel: SalesChannel;
  customerName: string;
  date: string;
}

export type StockStatus = 'ok' | 'low' | 'out';
