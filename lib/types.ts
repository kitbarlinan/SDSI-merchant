export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Debit / Credit Card'] as const;
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

export type Role = 'admin' | 'cashier' | 'clerk' | 'merchant';

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
  /** Physically on hand. Drops when goods leave: shipped (COD), handed over (COP) or sold at the counter. */
  stock: number;
  /** At or below this quantity the item is flagged as Low Stock. */
  reorderLevel: number;
  /** Product expiry, YYYY-MM-DD. */
  expiryDate: string;
  /** Switched off by the admin. A disabled SKU cannot be sold and its code is never reused. */
  disabled?: boolean;
}

export type StockStatus = 'ok' | 'low' | 'out';

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** COP = cash on pickup, COD = cash on delivery. */
export const ORDER_TERMS = ['COP', 'COD'] as const;
export type OrderTerms = (typeof ORDER_TERMS)[number];

/**
 * pending -> packed -> (COD only) shipped -> delivered.
 * rts = returned to sender after shipping. cancelled = closed before it left the warehouse.
 */
export type OrderStatus = 'pending' | 'packed' | 'shipped' | 'delivered' | 'rts' | 'cancelled';

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
  /** Unique PO ID (POID-000123). Generated once and never reused. */
  id: string;
  merchantId: string;
  source: OrderSource;
  createdBy: string;
  /** Local date and time, YYYY-MM-DDTHH:mm */
  createdAt: string;
  /** Walk-in sales default to "Walk-in client" and the cashier may change it. */
  customerName: string | null;
  contactNo: string;
  address: string;
  notes: string;
  terms: OrderTerms;
  lines: OrderLine[];
  status: OrderStatus;
  packedAt?: string;
  /** COD only: when it was handed to the courier. */
  shippedAt?: string;
  /** COD only: tracking number entered by the cashier. Visible to the merchant. */
  waybill?: string;
  deliveredAt?: string;
  rtsAt?: string;
  rtsReason?: string;
  /** Set once the returned goods were received back (pending or approved receipt). */
  returnReceiptId?: string;
  /** Staff member who last handled the order. */
  handledBy?: string;
  /** How the payment was actually collected. Set when delivered. */
  paymentMethod?: PaymentMethod;
  /** SDSI top-up percent in force when the order was delivered. */
  topUpRate?: number;
  cancelledAt?: string;
  cancelReason?: string;
  /** COD collection fee in HKD, snapshotted from the costing when the order was placed. */
  collectionFeeHkd?: number;
  /** COD shipping fee (SF) in HKD, snapshotted from the live costing at the same time. */
  sfHkd?: number;
  /** COD net price (pickup + SF + CF) in HKD, from the live costing. */
  netCodHkd?: number;
  /** Sum of the live pickup prices of the lines, HKD. */
  pickupHkd?: number;
  /** What the customer pays, HKD: COD = net COD price; pickup and counter sales = pickup total. */
  amountHkd?: number;

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
  /** Customer price basis: Net SRP plus the mark-up (990 -> 1,485). */
  gross: number;
  /** SDSI's top-up on this line (the mark-up, 495 on 990). */
  topUp: number;
  paymentMethod: PaymentMethod;
  terms: OrderTerms;
  source: OrderSource;
  customerName: string | null;
}

// ---------------------------------------------------------------------------
// Stock receiving (cashier receives, admin or inventory clerk approves)
// ---------------------------------------------------------------------------

export type ReceiptKind = 'stock-in' | 'rts';
export type ReceiptStatus = 'pending' | 'approved' | 'rejected';

export interface ReceiptLine {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
}

export interface StockReceipt {
  id: string;
  kind: ReceiptKind;
  merchantId: string;
  /** For kind === 'rts': the order the goods came back from. */
  orderId?: string;
  /** Day the goods physically arrived, YYYY-MM-DD. */
  receivedDate: string;
  lines: ReceiptLine[];
  note: string;
  receivedBy: string;
  createdAt: string;
  status: ReceiptStatus;
  decidedBy?: string;
  decidedAt?: string;
  rejectReason?: string;
}

// ---------------------------------------------------------------------------
// Reversal of a delivered order
// ---------------------------------------------------------------------------

export type ReversalStatus = 'pending' | 'approved' | 'rejected';

/**
 * The cashier says a delivered order was marked by mistake. The inventory clerk or admin decides.
 * The cashier's note is required, and nothing changes until it is approved.
 */
export interface ReversalRequest {
  id: string;
  orderId: string;
  merchantId: string;
  /** The order's status when the undo was requested. */
  fromStatus: OrderStatus;
  requestedBy: string;
  /** YYYY-MM-DDTHH:mm */
  requestedAt: string;
  /** Why the cashier is undoing it. Required. */
  note: string;
  status: ReversalStatus;
  decidedBy?: string;
  decidedAt?: string;
  /** Required when rejected. */
  decisionNote?: string;
}

// ---------------------------------------------------------------------------
// Remittances: the weekly payout to each merchant
// ---------------------------------------------------------------------------

/** pending: closed, nobody released it yet. submitted: the cashier released it, the admin must approve. released: approved. */
export type RemittanceStatus = 'pending' | 'submitted' | 'released';

export interface Remittance {
  id: string;
  merchantId: string;
  /** Monday of the cutoff week, YYYY-MM-DD. The week runs Monday to Sunday. */
  weekStart: string;
  weekEnd: string;
  /** Delivered orders in the week. Once listed here they are locked: no reversal. */
  orderIds: string[];
  /** Net payable (PHP): the Net SRP of those orders. */
  netPayable: number;
  /** Actual SF from PH to HK that SDSI advanced, deducted from the payout (PHP). */
  deductionPhp: number;
  deductionNote: string;
  /**
   * Correction of an earlier payout (SF advance entered wrong, for example). A released payout is
   * never edited; the fix goes into the next payout. + adds to this payout, - takes away from it.
   */
  adjustmentPhp: number;
  adjustmentNote: string;
  /** What is actually paid out: net payable minus the deduction, plus the adjustment. */
  payoutPhp: number;
  status: RemittanceStatus;
  closedBy: string;
  closedAt: string;
  /** The cashier who released the payout. */
  releasedBy?: string;
  releasedAt?: string;
  /** The admin who approved the release. */
  approvedBy?: string;
  approvedAt?: string;
  /** Why the admin sent the last release back, if they did. */
  rejectNote?: string;
  /** YYYY-MM-DD, the day the money was released to the merchant. */
  releasedDate?: string;
  reference?: string;
}
