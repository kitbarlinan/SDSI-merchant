export const PAYMENT_METHODS = ['Cash', 'GCash', 'Maya', 'Bank Transfer', 'Card'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CATEGORIES = [
  'Greens & Superfoods',
  'Herbal',
  'Vitamins & Minerals',
  'Beauty & Skin',
  'Heart & Wellness',
] as const;
export type Category = (typeof CATEGORIES)[number];

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'cashier' | 'merchant';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Only for role === 'merchant'. */
  merchantId?: string;
}

export interface Merchant {
  id: string;
  name: string;
  /** Used for chips and charts. */
  color: string;
}

// ---------------------------------------------------------------------------
// Inventory (each product belongs to one merchant, stored in SDSI's warehouse)
// ---------------------------------------------------------------------------

export interface InventoryItem {
  id: string;
  merchantId: string;
  sku: string;
  name: string;
  category: Category;
  unitCost: number;
  unitPrice: number;
  /** Physically on hand. Drops only when an order is delivered. */
  stock: number;
  /** At or below this quantity the item is flagged as Low Stock. */
  reorderLevel: number;
  /** Product expiry, YYYY-MM-DD. */
  expiryDate: string;
}

export type StockStatus = 'ok' | 'low' | 'out';

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** COP = cash on pickup, COD = cash on delivery. */
export const ORDER_TERMS = ['COP', 'COD'] as const;
export type OrderTerms = (typeof ORDER_TERMS)[number];

export type OrderStatus = 'pending' | 'packed' | 'delivered' | 'cancelled';

export type OrderSource = 'merchant' | 'walk-in';

export interface OrderLine {
  itemId: string;
  sku: string;
  name: string;
  category: Category;
  quantity: number;
  unitPrice: number;
  /** Cost snapshot at the time of the order. */
  unitCost: number;
  total: number;
}

export interface Order {
  id: string;
  merchantId: string;
  source: OrderSource;
  createdBy: string;
  /** Local date and time, YYYY-MM-DDTHH:mm */
  createdAt: string;
  /** null for walk-in sales: no customer details are collected. */
  customerName: string | null;
  contactNo: string;
  address: string;
  notes: string;
  terms: OrderTerms;
  lines: OrderLine[];
  status: OrderStatus;
  packedAt?: string;
  deliveredAt?: string;
  /** Staff member who last handled the order. */
  handledBy?: string;
  /** How the payment was actually collected. Set when delivered. */
  paymentMethod?: PaymentMethod;
  /** SDSI top-up percent in force when the order was delivered. */
  topUpRate?: number;
  cancelledAt?: string;
  cancelReason?: string;
}

/** One delivered order line, flattened for reporting. Dated by the day payment was collected. */
export interface SaleLine {
  id: string;
  orderId: string;
  merchantId: string;
  date: string;
  itemId: string;
  itemName: string;
  sku: string;
  category: Category;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
  /** SDSI's top-up on this line. */
  topUp: number;
  paymentMethod: PaymentMethod;
  terms: OrderTerms;
  source: OrderSource;
  customerName: string | null;
}
