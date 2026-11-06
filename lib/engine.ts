/**
 * Business rules as pure functions: (state, actor, input) -> new state or an error.
 * The React store just calls these, and they can be tested without any UI.
 *
 * NOTE: the permission checks here only protect the demo. Once this moves to Supabase the same
 * rules must be enforced on the server (row level security / server actions).
 */
import { roundMoney } from './format';
import {
  computeCosting,
  orderCharges,
  isSellable,
  snapshotLive,
  validateSkuCode,
  validatePickupPrice,
  validateSettings,
  resellerCharges,
  makePackageSale,
  orderTiers,
  uplineOf,
  SETTING_LABEL,
  type CostingLogEntry,
  type CostingRow,
  type CostingSettings,
  type CostingState,
  type ReferralLink,
} from './costing';
import { provisionReseller, validateCredentials } from './accounts';
import { demandOfLines, emptySplit, expiryOf, holderAt, makeStockBook, moveUnits, reservedUnits } from './stock';
import { orderTotal } from './orders';
import { buildWeekRemittances, remittedOrderIds, weekEndOf, weekStartOf } from './remittance';
import {
  PAYMENT_METHODS,
  type InventoryItem,
  type MasterProduct,
  type SkuPart,
  normalizeCategory,
  type Category,
  type Order,
  type OrderLine,
  type OrderStatus,
  type OrderTerms,
  type PackageSale,
  type PaymentMethod,
  type ReceiptLine,
  type Remittance,
  type ReversalRequest,
  type SentEmail,
  BRANCHES,
  DEFAULT_BRANCH,
  LEGACY_BRANCH,
  branchName,
  type BranchId,
  type Role,
  type StockReceipt,
  type User,
} from './types';

export interface AppState {
  items: InventoryItem[];
  /** The inventory master list (INV code, name, SRP, expiry per merchant). */
  products: MasterProduct[];
  orders: Order[];
  receipts: StockReceipt[];
  /** Cashier requests to undo a delivered order. */
  reversals: ReversalRequest[];
  /** Weekly payouts to merchants. */
  remittances: Remittance[];
  /** Pickup-price costing. Admin only. */
  costing: CostingState;
  /** Reseller packages sold. A reseller is active once they have one. */
  packageSales: PackageSale[];
  /** Everyone who can sign in. The reseller chain (sponsors) is read from here. */
  users: User[];
  /** Emails the app sent (demo: only listed). */
  outbox: SentEmail[];
  /** Last PO number handed out. Only ever goes up, so a POID is never reused. */
  poSeq: number;
}

export interface Actor {
  id: string;
  role: Role;
  merchantId?: string;
  /** Cashiers: the branch they work at. */
  branchId?: BranchId;
  /** Resellers: who brought them in. */
  sponsorId?: string;
}

export type Outcome<T> = { ok: true; state: AppState; value: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

const branchOk = (value: unknown): value is BranchId => BRANCHES.some((branch) => branch.id === value);

/** The admin handles every order; a cashier only the orders of their own branch. */
export function canHandle(actor: Actor, order: Pick<Order, 'branch'>): boolean {
  if (actor.role !== 'cashier') return true;
  return (order.branch ?? LEGACY_BRANCH) === (actor.branchId ?? LEGACY_BRANCH);
}
const wrongBranch = 'This order belongs to the other branch. Their cashier handles it.';

/** Handles orders and the counter. */
const isStaff = (actor: Actor): boolean => actor.role === 'admin' || actor.role === 'cashier';

/** Approves received stock. */
const canApprove = (actor: Actor): boolean => actor.role === 'admin' || actor.role === 'clerk';

const dateOf = (dateTime: string): string => dateTime.slice(0, 10);

export const formatPoid = (sequence: number): string => `POID-${String(sequence).padStart(6, '0')}`;

/** Hands out the next unique POIDs and the counter value to store afterwards. */
function nextPoids(state: AppState, count: number): { ids: string[]; poSeq: number } {
  const ids = Array.from({ length: count }, (_, index) => formatPoid(state.poSeq + index + 1));
  return { ids, poSeq: state.poSeq + count };
}

const formatReceiptId = (sequence: number): string => `RCV-${String(sequence).padStart(6, '0')}`;

const WALK_IN_DEFAULT_NAME = 'Walk-in client';

function mergeLines(lines: { itemId: string; quantity: number }[]): Map<string, number> {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.itemId, (merged.get(line.itemId) ?? 0) + line.quantity);
  }
  return merged;
}

/** Validates quantities against what is available and snapshots price and cost into order lines. */
function buildLines(
  state: AppState,
  requested: { itemId: string; quantity: number }[],
  today: string,
  merchantId?: string,
  branch?: BranchId,
): { ok: true; lines: OrderLine[] } | { ok: false; error: string } {
  if (requested.length === 0) return fail('Add at least one product.');
  const book = makeStockBook(state.items, state.products, state.orders);
  // Products already taken by earlier lines of this same order (two SKUs can share a product).
  const taken = new Map<string, number>();
  const lines: OrderLine[] = [];

  for (const [itemId, quantity] of mergeLines(requested)) {
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item || (merchantId && item.merchantId !== merchantId)) return fail('Product not found.');
    if (!isSellable(item, state.costing)) return fail(`"${item.name}" is not on sale.`);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return fail('Quantities must be whole numbers of at least 1.');
    }
    if (expiryOf(item, state.products) < today) return fail(`"${item.name}" is past its expiry date.`);
    const available = book.available(item, branch, taken);
    if (quantity > available) {
      if (branch) {
        const other = BRANCHES.find((candidate) => candidate.id !== branch)!;
        const elsewhere = book.available(item, other.id);
        const where = BRANCHES.find((candidate) => candidate.id === branch)!.name;
        if (available === 0) {
          return fail(`No stock left on this branch for "${item.name}" (${where}).${elsewhere > 0 ? ` ${other.name} has ${elsewhere}. Choose that branch instead.` : ''}`);
        }
        return fail(`Only ${available} of "${item.name}" available at ${where}.${elsewhere > 0 ? ` ${other.name} has ${elsewhere}.` : ''}`);
      }
      return fail(`Only ${available} of "${item.name}" available.`);
    }
    for (const [unitId, qty] of demandOfLines(state.items, [{ itemId, quantity }])) taken.set(unitId, (taken.get(unitId) ?? 0) + qty);
    lines.push({
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      total: roundMoney(quantity * item.unitPrice),
    });
  }
  return { ok: true, lines };
}

export interface PlaceOrderInput {
  customerName: string;
  contactNo: string;
  address: string;
  notes: string;
  terms: OrderTerms;
  lines: { itemId: string; quantity: number }[];
  /** Which branch handles the order. Default SDSI Sheung Wan. */
  branch?: BranchId;
}

/** A merchant places an order for their own customer. It starts Pending and waits for the cashier. */
export function placeMerchantOrder(
  state: AppState,
  actor: Actor,
  input: PlaceOrderInput,
  now: string,
): Outcome<Order> {
  if (actor.role !== 'merchant' || !actor.merchantId) return fail('Only merchants can place orders.');
  if (input.customerName.trim().length < 2) return fail('Enter the customer name.');
  if (input.terms === 'COD' && input.address.trim().length < 5) {
    return fail('A delivery address is required for cash on delivery.');
  }

  const orderBranch: BranchId = branchOk(input.branch) ? input.branch : DEFAULT_BRANCH;
  const built = buildLines(state, input.lines, dateOf(now), actor.merchantId, orderBranch);
  if (!built.ok) return fail(built.error);

  const { ids, poSeq } = nextPoids(state, 1);
  const order: Order = {
    id: ids[0],
    merchantId: actor.merchantId,
    source: 'merchant',
    createdBy: actor.id,
    createdAt: now,
    customerName: input.customerName.trim(),
    contactNo: input.contactNo.trim(),
    address: input.terms === 'COD' ? input.address.trim() : '',
    notes: input.notes.trim(),
    terms: input.terms,
    lines: built.lines,
    status: 'pending',
    branch: orderBranch,
  };
  const charges = orderCharges(
    built.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
    state.costing,
  );
  if (!charges) return fail('This order has no live price.');
  order.pickupHkd = charges.pickupHkd;
  if (input.terms === 'COD') {
    order.sfHkd = charges.sfHkd;
    order.collectionFeeHkd = charges.cfHkd;
    order.netCodHkd = charges.netCodHkd;
    order.amountHkd = charges.netCodHkd;
  } else {
    order.amountHkd = charges.pickupHkd;
  }
  return {
    ok: true,
    state: { ...state, poSeq, orders: [order, ...state.orders] },
    value: order,
  };
}

export interface ResellerOrderInput {
  customerName: string;
  contactNo: string;
  notes: string;
  lines: { itemId: string; quantity: number }[];
  /** Which branch handles the pickup. Default SDSI Sheung Wan. */
  branch?: BranchId;
}

export const isActiveReseller = (state: AppState, userId: string): boolean =>
  state.packageSales.some((sale) => sale.resellerId === userId);

const isPackageLine = (state: AppState, itemId: string): boolean =>
  Boolean(state.items.find((item) => item.id === itemId)?.package);

export const hasPackage = (state: AppState, order: Order): boolean =>
  order.lines.some((line) => isPackageLine(state, line.itemId));

/**
 * A delivered package order makes its buyer a reseller. The sale is recorded with the split of the package
 * (top-up, reseller share, tier income to the 3 sponsors above) worked out on what was paid.
 */
function addPackageSale(initial: AppState, initialOrder: Order, recordedBy: string, now: string): AppState {
  let state = initial;
  let order = initialOrder;
  // An applicant from the landing page gets their account now that the cashier confirmed the payment.
  if (order.applicant && !order.buyerId) {
    const made = provisionReseller(
      state.users,
      { name: order.applicant.name, email: order.applicant.email, sponsorId: order.applicant.sponsorId },
      now,
      state.outbox.length + 1,
    );
    order = { ...order, buyerId: made.user.id };
    state = {
      ...state,
      users: [...state.users, made.user],
      outbox: made.email ? [made.email, ...state.outbox] : state.outbox,
      orders: state.orders.map((candidate) => (candidate.id === order.id ? order : candidate)),
    };
  }
  const buyerId = order.buyerId ?? order.createdBy;
  const buyer = state.users.find((user) => user.id === buyerId && user.role === 'customer');
  if (!buyer || isActiveReseller(state, buyer.id)) return state;
  const active = new Set(state.packageSales.map((sale) => sale.resellerId));
  const sale = makePackageSale(
    `PKG-${String(state.packageSales.length + 1).padStart(4, '0')}`,
    buyer,
    state.costing.settings,
    uplineOf(state.users, active, buyer.id),
    recordedBy,
    now,
    { hkd: order.amountHkd ?? state.costing.settings.packageHkd, srpPhp: orderTotal(order), orderId: order.id, paymentMethod: order.paymentMethod },
  );
  return { ...state, packageSales: [sale, ...state.packageSales] };
}

/**
 * A reseller / customer orders with their own login. Pickup only (COP), no SF or CF. The discount
 * (costing setting, 10% for now) comes off the pickup price in HKD and is charged to the merchant.
 * Products from different merchants become separate orders, one per merchant. They start Pending.
 */
export function placeResellerOrder(
  state: AppState,
  actor: Actor,
  input: ResellerOrderInput,
  now: string,
): Outcome<Order[]> {
  if (actor.role !== 'customer') return fail('Only resellers can place this kind of order.');
  if (input.customerName.trim().length < 2) return fail('Enter your name.');

  const active = isActiveReseller(state, actor.id);
  const packageLines = input.lines.filter((line) => isPackageLine(state, line.itemId));
  if (!active) {
    if (input.lines.length !== 1 || packageLines.length !== 1 || packageLines[0].quantity !== 1) {
      return fail('Buy the reseller package first. It is the only thing you can order until then (one package).');
    }
  } else if (packageLines.length > 0) {
    return fail('You already have the reseller package.');
  }

  const resellerBranch: BranchId = branchOk(input.branch) ? input.branch : DEFAULT_BRANCH;
  const built = buildLines(state, input.lines, dateOf(now), undefined, resellerBranch);
  if (!built.ok) return fail(built.error);

  const byMerchant = new Map<string, OrderLine[]>();
  for (const line of built.lines) {
    const merchantId = state.items.find((item) => item.id === line.itemId)!.merchantId;
    byMerchant.set(merchantId, [...(byMerchant.get(merchantId) ?? []), line]);
  }

  const { ids, poSeq } = nextPoids(state, byMerchant.size);
  const { resellerDiscountPct } = state.costing.settings;
  const upline = uplineOf(state.users, new Set(state.packageSales.map((sale) => sale.resellerId)), actor.id);
  const created: Order[] = [];
  for (const [merchantId, lines] of byMerchant) {
    const charges = resellerCharges(lines, state.items, state.costing);
    if (!charges) return fail('One of these products has no live price.');
    const order: Order = {
      id: ids[created.length],
      merchantId,
      source: 'reseller',
      createdBy: actor.id,
      createdAt: now,
      customerName: input.customerName.trim(),
      contactNo: input.contactNo.trim(),
      address: '',
      notes: input.notes.trim(),
      terms: 'COP',
      lines,
      status: 'pending',
      pickupHkd: charges.pickupHkd,
      amountHkd: charges.amountHkd,
      buyerId: actor.id,
      branch: resellerBranch,
    };
    if (charges.discountHkd > 0) {
      order.discountPct = resellerDiscountPct;
      order.discountHkd = charges.discountHkd;
      order.discountPhp = charges.discountPhp;
    }
    // Tier income is worked out on the SRP of the program products and paid from SDSI's top-up once delivered.
    const tiers = active && charges.eligibleSrpPhp > 0 ? orderTiers(state.costing.settings, upline, charges.eligibleSrpPhp) : [];
    if (tiers.length > 0) order.tiers = tiers;
    created.push(order);
  }
  return { ok: true, state: { ...state, poSeq, orders: [...created.reverse(), ...state.orders] }, value: created };
}

/**
 * Counter sale: the customer name is optional. Paid on the spot, so it is delivered immediately.
 * Items from different merchants become separate orders because each sale belongs to one merchant.
 */
export function checkoutWalkIn(
  state: AppState,
  actor: Actor,
  input: {
    lines: { itemId: string; quantity: number }[];
    paymentMethod: PaymentMethod;
    /** Optional. Defaults to "Walk-in client". */
    customerName?: string;
    /** Admin only: which branch's counter. A cashier always sells at their own branch. */
    branch?: BranchId;
    /** Required when the cart has the reseller package: the reseller who is buying it. */
    resellerId?: string;
    /** Or a new customer who buys the package: they become a reseller account (the login invite comes later). */
    newReseller?: { name: string; email?: string; sponsorId?: string };
  },
  now: string,
): Outcome<Order[]> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can run the counter.');
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return fail('Choose a payment method.');
  const packageLines = input.lines.filter((line) => isPackageLine(state, line.itemId));
  let packageBuyer: User | undefined;
  let newUser: User | undefined;
  let newEmail: SentEmail | undefined;
  if (packageLines.length > 0) {
    if (input.lines.length !== 1 || packageLines[0].quantity !== 1) return fail('Sell the reseller package on its own, one at a time.');
    if (input.newReseller) {
      const name = input.newReseller.name.trim();
      if (name.length < 2) return fail('Enter the name of the customer buying the package.');
      const email = input.newReseller.email?.trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) return fail('That email does not look right.');
      const sponsorId = input.newReseller.sponsorId || undefined;
      if (sponsorId && !isActiveReseller(state, sponsorId)) return fail('The sponsor must be a reseller who already has the package.');
      const made = provisionReseller(state.users, { name, email, sponsorId }, now, state.outbox.length + 1);
      newUser = made.user;
      newEmail = made.email;
      packageBuyer = newUser;
    } else {
      packageBuyer = state.users.find((user) => user.id === input.resellerId && user.role === 'customer');
      if (!packageBuyer) return fail('Choose or enter the customer who is buying the package.');
      if (isActiveReseller(state, packageBuyer.id)) return fail(`${packageBuyer.name} already has the package.`);
    }
  } else if (input.resellerId || input.newReseller) {
    return fail('A reseller is only chosen when selling the package.');
  }

  const branch: BranchId = actor.role === 'cashier' ? actor.branchId ?? DEFAULT_BRANCH : branchOk(input.branch) ? input.branch : DEFAULT_BRANCH;
  const built = buildLines(state, input.lines, dateOf(now), undefined, branch);
  if (!built.ok) return fail(built.error);

  const merchantOf = (itemId: string) =>
    state.items.find((item) => item.id === itemId)!.merchantId;
  const byMerchant = new Map<string, OrderLine[]>();
  for (const line of built.lines) {
    const merchantId = merchantOf(line.itemId);
    byMerchant.set(merchantId, [...(byMerchant.get(merchantId) ?? []), line]);
  }

  const { ids, poSeq } = nextPoids(state, byMerchant.size);
  const customerName = packageBuyer?.name ?? (input.customerName?.trim() || WALK_IN_DEFAULT_NAME);
  const created: Order[] = [...byMerchant.entries()].map(([merchantId, lines], index) => {
    const charges = orderCharges(
      lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
      state.costing,
    )!;
    return {
    id: ids[index],
    merchantId,
    source: 'walk-in',
    createdBy: actor.id,
    createdAt: now,
    customerName,
    contactNo: '',
    address: '',
    notes: '',
    terms: 'COP',
    lines,
    status: 'delivered',
    packedAt: now,
    deliveredAt: now,
    handledBy: actor.id,
    paymentMethod: input.paymentMethod,
    topUpRate: state.costing.settings.markupPct,
    pickupHkd: charges.pickupHkd,
    amountHkd: charges.pickupHkd,
    branch,
    ...(packageBuyer ? { buyerId: packageBuyer.id } : {}),
    };
  });

  const moved = moveUnits(state.items, state.products, branch, demandOfLines(state.items, built.lines), -1);

  const first = created[0];
  const next: AppState = {
    ...state,
    poSeq,
    items: moved.items,
    products: moved.products,
    orders: [...[...created].reverse(), ...state.orders],
  };
  const withUser: AppState = newUser
    ? { ...next, users: [...next.users, newUser], outbox: newEmail ? [newEmail, ...next.outbox] : next.outbox }
    : next;
  return { ok: true, state: packageBuyer ? addPackageSale(withUser, first, actor.id, now) : withUser, value: created };
}

function updateOrder(state: AppState, orderId: string, change: Partial<Order>): AppState {
  return {
    ...state,
    orders: state.orders.map((order) => (order.id === orderId ? { ...order, ...change } : order)),
  };
}

export function markPacked(
  state: AppState,
  actor: Actor,
  orderId: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can pack orders.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (!canHandle(actor, order)) return fail(wrongBranch);
  if (order.status !== 'pending') return fail('Only pending orders can be marked as packed.');
  const next = updateOrder(state, orderId, { status: 'packed', packedAt: now, handledBy: actor.id });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** Takes the goods of an order off the shelf. Fails if the shelf does not have enough. */
function releaseStock(state: AppState, order: Order): { ok: true; items: InventoryItem[]; products: MasterProduct[] } | { ok: false; error: string } {
  const branch = order.branch ?? LEGACY_BRANCH;
  const need = demandOfLines(state.items, order.lines);
  const names = (id: string) => state.products.find((product) => product.id === id)?.name ?? state.items.find((item) => item.id === id)?.name ?? 'a product';
  for (const [unitId, qty] of need) {
    const holder = state.products.find((product) => product.id === unitId) ?? state.items.find((item) => item.id === unitId);
    if (!holder || holderAt(holder, branch) < qty) {
      return fail(`Not enough "${names(unitId)}" on hand at this branch. Receive stock first.`);
    }
  }
  return { ok: true, ...moveUnits(state.items, state.products, branch, need, -1) };
}

/**
 * COD only: the order is handed to the courier. The waybill is the tracking number the merchant
 * sees. The goods leave the warehouse now, so on-hand stock drops here.
 */
export function shipOrder(
  state: AppState,
  actor: Actor,
  orderId: string,
  waybill: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can ship orders.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (!canHandle(actor, order)) return fail(wrongBranch);
  if (order.terms !== 'COD') return fail('Only cash on delivery orders are shipped.');
  if (order.status !== 'packed') return fail('Pack the order before shipping it.');
  const code = waybill.trim();
  if (code.length < 4) return fail('Enter the waybill number.');
  if (state.orders.some((other) => other.waybill?.toLowerCase() === code.toLowerCase())) {
    return fail('That waybill number is already used on another order.');
  }
  const released = releaseStock(state, order);
  if (!released.ok) return fail(released.error);

  const next = updateOrder({ ...state, items: released.items, products: released.products }, orderId, {
    status: 'shipped',
    shippedAt: now,
    waybill: code,
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/**
 * Payment is in hand and the sale counts. COD orders must have been shipped first.
 * COP orders are handed over now, so their stock leaves the shelf at this moment.
 */
export function markDelivered(
  state: AppState,
  actor: Actor,
  orderId: string,
  paymentMethod: PaymentMethod,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can mark orders as delivered.');
  if (!PAYMENT_METHODS.includes(paymentMethod)) return fail('Choose how the payment was collected.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (!canHandle(actor, order)) return fail(wrongBranch);
  if (hasPendingUndo(state, orderId)) return fail('An undo request for this order is waiting for approval.');

  let base = state;
  if (order.terms === 'COD') {
    if (order.status !== 'shipped') return fail('Ship the order with a waybill before marking it delivered.');
  } else {
    if (order.status !== 'packed') return fail('Pack the order before marking it as delivered.');
    const released = releaseStock(state, order);
    if (!released.ok) return fail(released.error);
    base = { ...state, items: released.items, products: released.products };
  }

  const next = updateOrder(base, orderId, {
    status: 'delivered',
    deliveredAt: now,
    handledBy: actor.id,
    paymentMethod,
    topUpRate: state.costing.settings.markupPct,
  });
  const delivered = next.orders.find((o) => o.id === orderId)!;
  const final = hasPackage(next, delivered) ? addPackageSale(next, delivered, actor.id, now) : next;
  return { ok: true, state: final, value: delivered };
}

/** A shipped order came back (customer refused, unreachable...). No sale; goods return via receiving. */
export function markRts(
  state: AppState,
  actor: Actor,
  orderId: string,
  reason: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can mark an order as RTS.');
  if (reason.trim().length < 2) return fail('Select or enter a reason.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (!canHandle(actor, order)) return fail(wrongBranch);
  if (order.status !== 'shipped') return fail('Only shipped orders can be returned to sender.');
  if (hasPendingUndo(state, orderId)) return fail('An undo request for this order is waiting for approval.');
  const next = updateOrder(state, orderId, {
    status: 'rts',
    rtsAt: now,
    rtsReason: reason.trim(),
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

/** "Not delivered" before the goods left: the reserved stock is released and no sale is recorded. */
export function cancelOrder(
  state: AppState,
  actor: Actor,
  orderId: string,
  reason: string,
  now: string,
): Outcome<Order> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can close an order as not delivered.');
  if (reason.trim().length < 2) return fail('Select or enter a reason.');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (!canHandle(actor, order)) return fail(wrongBranch);
  if (order.status !== 'pending' && order.status !== 'packed') {
    return fail('Only orders that have not shipped can be closed. Use RTS for shipped orders.');
  }
  const next = updateOrder(state, orderId, {
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: reason.trim(),
    handledBy: actor.id,
  });
  return { ok: true, state: next, value: next.orders.find((o) => o.id === orderId)! };
}

// ---------------------------------------------------------------------------
// Receiving: the cashier records what arrived, admin or the inventory clerk approves.
// Stock only changes when a receipt is approved.
// ---------------------------------------------------------------------------

function validReceivedDate(date: string, now: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Enter the date the goods were received.';
  if (date > dateOf(now)) return 'The received date cannot be in the future.';
  return null;
}

/**
 * Stock in (goods arrived) or stock out (damaged, expired, sample, sent back to the merchant).
 * The cashier's entry waits for the inventory clerk or admin. The clerk's and admin's own entries
 * need no approver: they go through at once.
 */
export function createStockInReceipt(
  state: AppState,
  actor: Actor,
  input: {
    kind?: 'stock-in' | 'stock-out';
    merchantId: string;
    receivedDate: string;
    note: string;
    /** Stock is recorded per master-list product (productId). Older hand-typed SKUs that keep their own stock use itemId. */
    lines: { productId?: string; itemId?: string; quantity: number }[];
    /** Admin and clerk choose the branch. A cashier always works on their own. */
    branch?: BranchId;
  },
  now: string,
): Outcome<StockReceipt> {
  if (!(actor.role === 'cashier' || canApprove(actor))) return fail('Only SDSI staff can record stock movements.');
  const branch: BranchId = actor.role === 'cashier' ? actor.branchId ?? DEFAULT_BRANCH : branchOk(input.branch) ? input.branch : DEFAULT_BRANCH;
  const kind = input.kind ?? 'stock-in';
  const dateError = validReceivedDate(input.receivedDate, now);
  if (dateError) return fail(dateError);
  if (!state.products.some((product) => product.merchantId === input.merchantId) && !state.items.some((item) => item.merchantId === input.merchantId)) {
    return fail('Choose the merchant the stock belongs to.');
  }
  if (kind === 'stock-out' && input.note.trim().length < 3) return fail('Write the reason for the stock out.');
  const held = reservedUnits(state.orders, state.items, branch);
  const lines: ReceiptLine[] = [];
  const merged = new Map<string, { productId?: string; itemId?: string; quantity: number }>();
  for (const line of input.lines) {
    const key = line.productId ?? line.itemId ?? '';
    merged.set(key, { ...line, quantity: (merged.get(key)?.quantity ?? 0) + line.quantity });
  }
  for (const [key, line] of merged) {
    const quantity = line.quantity;
    if (quantity === 0) continue;
    const product = line.productId ? state.products.find((candidate) => candidate.id === key) : undefined;
    const legacy = !line.productId ? state.items.find((candidate) => candidate.id === key) : undefined;
    if (legacy?.parts?.length) return fail(`Stock is kept per product, not per SKU. Record "${legacy.name}" by the products inside it.`);
    const holder = product ?? legacy;
    if (!holder || holder.merchantId !== input.merchantId) return fail('Product not found for this merchant.');
    if (!Number.isInteger(quantity) || quantity < 1) return fail('Quantities must be whole numbers.');
    if (kind === 'stock-out' && quantity > Math.max(0, holderAt(holder, branch) - (held.get(holder.id) ?? 0))) {
      return fail(`Only ${Math.max(0, holderAt(holder, branch) - (held.get(holder.id) ?? 0))} of "${holder.name}" are available to take out at this branch.`);
    }
    lines.push({ itemId: holder.id, ...(product ? { productId: product.id } : {}), sku: product ? product.code : (holder as InventoryItem).sku, name: holder.name, quantity });
  }
  if (lines.length === 0) {
    return fail(`Enter the quantity ${kind === 'stock-in' ? 'received' : 'to take out'} for at least one product.`);
  }

  const selfApproved = canApprove(actor);
  const receipt: StockReceipt = {
    id: formatReceiptId(state.receipts.length + 1),
    kind,
    merchantId: input.merchantId,
    receivedDate: input.receivedDate,
    lines,
    note: input.note.trim(),
    receivedBy: actor.id,
    createdAt: now,
    branch,
    status: selfApproved ? 'approved' : 'pending',
    ...(selfApproved ? { decidedBy: actor.id, decidedAt: now } : {}),
  };
  const sign = kind === 'stock-in' ? 1 : -1;
  const moved = selfApproved
    ? moveUnits(state.items, state.products, branch, demandOfLines(state.items, lines), sign)
    : { items: state.items, products: state.products };
  return { ok: true, state: { ...state, ...moved, receipts: [receipt, ...state.receipts] }, value: receipt };
}

/**
 * Moves stock from one branch's shelf to the other, for example when a delivery was received under the wrong branch.
 * Admin or inventory clerk only, and it posts at once. It is written as a stock out at the first branch and a stock in
 * at the second, so the history shows both sides and each branch's count stays right.
 */
export function transferStock(
  state: AppState,
  actor: Actor,
  input: {
    merchantId: string;
    from: BranchId;
    to: BranchId;
    receivedDate: string;
    note: string;
    lines: { productId?: string; itemId?: string; quantity: number }[];
  },
  now: string,
): Outcome<StockReceipt> {
  if (!canApprove(actor)) return fail('Only the admin or the inventory clerk can move stock between branches.');
  if (!branchOk(input.from) || !branchOk(input.to)) return fail('Choose both branches.');
  if (input.from === input.to) return fail('Choose two different branches.');
  const why = input.note.trim() || 'branch correction';
  const base = { merchantId: input.merchantId, receivedDate: input.receivedDate, lines: input.lines };
  const out = createStockInReceipt(state, actor, { ...base, kind: 'stock-out', branch: input.from, note: `Transfer to ${branchName(input.to)}: ${why}` }, now);
  if (!out.ok) return out;
  const into = createStockInReceipt(out.state, actor, { ...base, kind: 'stock-in', branch: input.to, note: `Transfer from ${branchName(input.from)}: ${why}` }, now);
  if (!into.ok) return into;
  return { ok: true, state: into.state, value: out.value };
}

/** The courier brought an RTS order back. The cashier logs it; approval puts it back on the shelf. */
export function createReturnReceipt(
  state: AppState,
  actor: Actor,
  input: { orderId: string; receivedDate: string; note: string },
  now: string,
): Outcome<StockReceipt> {
  if (actor.role !== 'cashier') return fail('Only the cashier can receive returned goods.');
  const dateError = validReceivedDate(input.receivedDate, now);
  if (dateError) return fail(dateError);
  const order = state.orders.find((candidate) => candidate.id === input.orderId);
  if (!order) return fail('Order not found.');
  if (order.status !== 'rts') return fail('Only RTS orders can be received back.');
  if (hasPendingUndo(state, order.id)) return fail('An undo request for this order is waiting for approval.');
  if (order.returnReceiptId) return fail('These goods were already received back.');

  const receipt: StockReceipt = {
    id: formatReceiptId(state.receipts.length + 1),
    kind: 'rts',
    merchantId: order.merchantId,
    orderId: order.id,
    receivedDate: input.receivedDate,
    lines: order.lines.map((line) => ({
      itemId: line.itemId,
      sku: line.sku,
      name: line.name,
      quantity: line.quantity,
    })),
    note: input.note.trim(),
    receivedBy: actor.id,
    createdAt: now,
    branch: order.branch ?? LEGACY_BRANCH,
    status: 'pending',
  };
  return {
    ok: true,
    state: updateOrder(
      { ...state, receipts: [receipt, ...state.receipts] },
      order.id,
      { returnReceiptId: receipt.id },
    ),
    value: receipt,
  };
}

function decide(
  state: AppState,
  actor: Actor,
  receiptId: string,
  status: 'approved' | 'rejected',
  now: string,
  rejectReason?: string,
): Outcome<StockReceipt> {
  if (!canApprove(actor)) return fail('Only the admin or inventory clerk can approve received stock.');
  const receipt = state.receipts.find((candidate) => candidate.id === receiptId);
  if (!receipt) return fail('Receipt not found.');
  if (receipt.status !== 'pending') return fail('This receipt was already reviewed.');

  const decided: StockReceipt = {
    ...receipt,
    status,
    decidedBy: actor.id,
    decidedAt: now,
    ...(status === 'rejected' ? { rejectReason } : {}),
  };

  let items = state.items;
  let products = state.products;
  if (status === 'approved') {
    const sign = receipt.kind === 'stock-out' ? -1 : 1;
    const branch = receipt.branch ?? LEGACY_BRANCH;
    const add = demandOfLines(state.items, receipt.lines);
    if (sign === -1) {
      const held = reservedUnits(state.orders, state.items, branch);
      for (const [unitId, qty] of add) {
        const holder = state.products.find((product) => product.id === unitId) ?? state.items.find((item) => item.id === unitId);
        if (!holder || qty > Math.max(0, holderAt(holder, branch) - (held.get(unitId) ?? 0))) {
          return fail(`Not enough "${holder?.name ?? 'product'}" available at this branch to take out anymore.`);
        }
      }
    }
    ({ items, products } = moveUnits(state.items, state.products, branch, add, sign));
  }

  let next: AppState = {
    ...state,
    items,
    products,
    receipts: state.receipts.map((candidate) => (candidate.id === receiptId ? decided : candidate)),
  };
  // A rejected return can be received again.
  if (status === 'rejected' && receipt.kind === 'rts' && receipt.orderId) {
    next = {
      ...next,
      orders: next.orders.map((order) =>
        order.id === receipt.orderId ? { ...order, returnReceiptId: undefined } : order,
      ),
    };
  }
  return { ok: true, state: next, value: decided };
}

export const approveReceipt = (
  state: AppState,
  actor: Actor,
  receiptId: string,
  now: string,
): Outcome<StockReceipt> => decide(state, actor, receiptId, 'approved', now);

export function rejectReceipt(
  state: AppState,
  actor: Actor,
  receiptId: string,
  reason: string,
  now: string,
): Outcome<StockReceipt> {
  if (reason.trim().length < 2) return fail('Enter the reason for rejecting.');
  return decide(state, actor, receiptId, 'rejected', now, reason.trim());
}


// ---------------------------------------------------------------------------
// Costing: admin only. Every change is written to the change log, nothing is edited silently.
// ---------------------------------------------------------------------------

const hk = (value: number | null): string => (value === null ? 'not set' : `HK$${value.toFixed(2)}`);

function logged(
  state: AppState,
  actor: Actor,
  now: string,
  summary: string,
  details: string[],
  change: Partial<CostingState>,
): AppState {
  const entry: CostingLogEntry = {
    id: `CL-${String(state.costing.log.length + 1).padStart(6, '0')}`,
    at: now,
    by: actor.id,
    summary,
    details,
  };
  return { ...state, costing: { ...state.costing, ...change, log: [entry, ...state.costing.log] } };
}

const costingGuard = (actor: Actor) =>
  actor.role === 'admin' ? null : fail('Only the admin can change the costing.');

/** Sets the pickup price (HKD) of one or more packages. All changes are checked first, then saved together. */
export function setPickupPrices(
  state: AppState,
  actor: Actor,
  changes: { rowId: string; pickupPriceHkd: number }[],
  now: string,
): Outcome<number> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  if (changes.length === 0) return fail('There is nothing to save.');

  const details: string[] = [];
  const priceOf = new Map<string, number>();
  for (const change of changes) {
    const row = state.costing.rows.find((candidate) => candidate.id === change.rowId);
    if (!row) return fail('Costing row not found.');
    const problem = validatePickupPrice(change.pickupPriceHkd);
    if (problem) return fail(problem);
    if (priceOf.has(row.id)) return fail('The same row was changed twice.');
    if (change.pickupPriceHkd === row.pickupPriceHkd) return fail('A price was not changed.');
    priceOf.set(row.id, change.pickupPriceHkd);
    const item = state.items.find((candidate) => candidate.id === row.itemId);
    details.push(`${item?.sku ?? row.itemId}: ${hk(row.pickupPriceHkd)} -> ${hk(change.pickupPriceHkd)}`);
  }

  // A new price is a new draft. Any earlier approval no longer counts. The live version stays in use until the new one goes live.
  const rows = state.costing.rows.map((row) =>
    priceOf.has(row.id)
      ? { ...row, pickupPriceHkd: priceOf.get(row.id)!, status: 'draft' as const, approvedBy: undefined, approvedAt: undefined }
      : row,
  );
  // A reseller package shows its pickup price to people applying, so keep the two the same.
  const packagePrice = new Map<string, number>();
  for (const row of rows) if (priceOf.has(row.id)) packagePrice.set(row.itemId, priceOf.get(row.id)!);
  return {
    ok: true,
    state: {
      ...logged(
        state,
        actor,
        now,
        `Pickup price changed on ${changes.length} package${changes.length === 1 ? '' : 's'}`,
        details,
        { rows },
      ),
      items: state.items.map((item) => (item.package && packagePrice.has(item.id) ? { ...item, package: { ...item.package, priceHkd: packagePrice.get(item.id)! } } : item)),
    },
    value: changes.length,
  };
}

export function setCostingSettings(
  state: AppState,
  actor: Actor,
  patch: Partial<CostingSettings>,
  now: string,
): Outcome<CostingSettings> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const keys = (Object.keys(patch) as (keyof CostingSettings)[]).filter(
    (key) => patch[key] !== state.costing.settings[key],
  );
  if (keys.length === 0) return fail('No setting was changed.');
  const problem = validateSettings(patch);
  if (problem) return fail(problem);

  const settings = { ...state.costing.settings, ...patch };
  const details = keys.map((key) => `${SETTING_LABEL[key]}: ${state.costing.settings[key]} -> ${patch[key]}`);
  return {
    ok: true,
    state: logged(state, actor, now, 'Costing settings changed', details, { settings }),
    value: settings,
  };
}

export function removeCostingRow(
  state: AppState,
  actor: Actor,
  rowId: string,
  now: string,
): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.live) return fail('This package has been live. Disable the SKU instead of removing it.');
  const item = state.items.find((candidate) => candidate.id === row.itemId);
  return {
    ok: true,
    state: logged(
      state,
      actor,
      now,
      'Costing row removed',
      [`${item?.sku ?? row.itemId} (pickup ${hk(row.pickupPriceHkd)})`],
      { rows: state.costing.rows.filter((candidate) => candidate.id !== rowId) },
    ),
    value: row,
  };
}

const rowLabel = (state: AppState, row: CostingRow) =>
  state.items.find((candidate) => candidate.id === row.itemId)?.sku ?? row.itemId;

const replaceRow = (state: AppState, rowId: string, patch: Partial<CostingRow>): CostingRow[] =>
  state.costing.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row));

/** Step 1: the draft is checked and approved. Needs a pickup price. */
export function approveCostingRow(state: AppState, actor: Actor, rowId: string, now: string): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.status !== 'draft') return fail('Only a draft can be approved.');
  if (row.pickupPriceHkd === null) return fail('Set the pickup price before approving.');
  const next = { ...row, status: 'approved' as const, approvedBy: actor.id, approvedAt: now };
  return {
    ok: true,
    state: logged(state, actor, now, 'Package approved', [`${rowLabel(state, row)}: pickup ${hk(row.pickupPriceHkd)}`], {
      rows: replaceRow(state, rowId, next),
    }),
    value: next,
  };
}

/** Takes an approved package back to draft, for example when a mistake is found before going live. */
export function revokeApproval(state: AppState, actor: Actor, rowId: string, now: string): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.status !== 'approved') return fail('Only an approved package can go back to draft.');
  const next = { ...row, status: 'draft' as const, approvedBy: undefined, approvedAt: undefined };
  return {
    ok: true,
    state: logged(state, actor, now, 'Approval removed', [rowLabel(state, row)], { rows: replaceRow(state, rowId, next) }),
    value: next,
  };
}

/** Step 2: an approved package goes live. Orders use its frozen price, SF and CF from now on. */
export function goLiveCostingRow(state: AppState, actor: Actor, rowId: string, now: string): Outcome<CostingRow> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const row = state.costing.rows.find((candidate) => candidate.id === rowId);
  if (!row) return fail('Costing row not found.');
  if (row.status !== 'approved') return fail('Approve the package before going live.');
  const item = state.items.find((candidate) => candidate.id === row.itemId);
  if (!item) return fail('Product not found.');
  const live = snapshotLive(item.unitPrice, row, state.costing.settings, actor.id, now);
  if (!live) return fail('Set the pickup price first.');
  const next = { ...row, status: 'live' as const, live };
  const before = row.live ? `was ${hk(row.live.pickupPriceHkd)}, ` : 'first time live, ';
  return {
    ok: true,
    state: logged(
      state,
      actor,
      now,
      'Package went live',
      [`${rowLabel(state, row)}: ${before}now pickup ${hk(live.pickupPriceHkd)}, SF ${hk(live.sfHkd)}, CF ${hk(live.cfHkd)}, net COD ${hk(live.netCodHkd)}`],
      { rows: replaceRow(state, rowId, next) },
    ),
    value: next,
  };
}

/** Disable or re-enable a whole SKU. Open orders are not touched; new orders cannot include it. */
export function setSkuDisabled(
  state: AppState,
  actor: Actor,
  itemId: string,
  disabled: boolean,
  now: string,
): Outcome<InventoryItem> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail('Product not found.');
  if (Boolean(item.disabled) === disabled) return fail(disabled ? 'This SKU is already disabled.' : 'This SKU is already enabled.');
  const next = { ...item, disabled };
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, disabled ? 'SKU disabled' : 'SKU enabled', [`${item.sku} ${item.name}`], {}),
      items: state.items.map((candidate) => (candidate.id === itemId ? next : candidate)),
    },
    value: next,
  };
}

export function setProgramMerchant(
  state: AppState,
  actor: Actor,
  merchantId: string,
  on: boolean,
  now: string,
): Outcome<string[]> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  if (!state.items.some((item) => item.merchantId === merchantId)) return fail('Merchant not found.');
  const current = state.costing.programMerchantIds;
  if (current.includes(merchantId) === on) return fail(on ? 'This merchant is already in the program.' : 'This merchant is not in the program.');
  const ids = on ? [...current, merchantId] : current.filter((id) => id !== merchantId);
  return {
    ok: true,
    state: logged(state, actor, now, on ? 'Merchant added to the reseller program' : 'Merchant removed from the reseller program', [merchantId], {
      programMerchantIds: ids,
    }),
    value: ids,
  };
}

/** Admin: who brought a merchant in (earns the referral bonus), or null to clear. */
export function setMerchantReferrer(
  state: AppState,
  actor: Actor,
  merchantId: string,
  userId: string | null,
  now: string,
): Outcome<ReferralLink[]> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  if (userId !== null && !state.users.some((user) => user.id === userId && user.role === 'customer')) return fail('Pick a reseller account as the referrer.');
  const rest = (state.costing.referrals ?? []).filter((link) => link.merchantId !== merchantId);
  const referrals = userId === null ? rest : [...rest, { merchantId, userId }];
  const who = userId ? state.users.find((user) => user.id === userId)?.name ?? userId : 'nobody';
  return {
    ok: true,
    state: logged(state, actor, now, 'Referrer of a merchant changed', [`${merchantId}: ${who}`], { referrals }),
    value: referrals,
  };
}

export function setSkuReseller(
  state: AppState,
  actor: Actor,
  itemId: string,
  inProgram: boolean,
  now: string,
): Outcome<InventoryItem> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail('Product not found.');
  if (!item.resellerOff === inProgram) return fail(inProgram ? 'This SKU is already in the program.' : 'This SKU is already switched off.');
  const next: InventoryItem = { ...item, resellerOff: inProgram ? undefined : true };
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, inProgram ? 'SKU switched on for resellers' : 'SKU switched off for resellers', [`${item.sku} ${item.name}`], {}),
      items: state.items.map((candidate) => (candidate.id === itemId ? next : candidate)),
    },
    value: next,
  };
}

// ---------------------------------------------------------------------------
// Inventory master list: the products each merchant keeps with SDSI (INV CODE, name, SRP, optional expiry).
// SKUs and bundles are built from these.
// ---------------------------------------------------------------------------

const inventoryGuard = (actor: Actor) =>
  actor.role === 'admin' || actor.role === 'clerk' ? null : fail('Only the admin or the inventory clerk can change the master list.');

const PRODUCT_CODE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$/;
const normName = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

/** A real calendar date written YYYY-MM-DD. */
export const isRealDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export interface ProductInput {
  merchantId: string;
  code: string;
  name: string;
  srp: number;
  expiryDate?: string;
  /** Optional supplier name. */
  supplier?: string;
  /** Optional category (Food Supplements or Beauty Products). */
  category?: Category | '';
}

const cleanSupplier = (value: string | undefined | null): string => (value ?? '').trim().replace(/\s+/g, ' ');
const supplierProblem = (value: string): string | null => (value.length > 60 ? 'Supplier name: up to 60 characters.' : null);

function checkProduct(code: string, name: string, srp: number, expiry: string | undefined): string | null {
  if (!PRODUCT_CODE.test(code.trim())) return 'INV code: 1 to 30 letters, numbers, dots, dashes, slashes or underscores.';
  if (name.trim().length < 2) return 'Enter the product name.';
  if (!Number.isFinite(srp) || srp <= 0 || srp > 1_000_000) return 'Enter the SRP above 0.';
  if (expiry && !isRealDate(expiry)) return 'Expiry must be a real date, YYYY-MM-DD.';
  return null;
}

const nextProductNo = (products: MasterProduct[]) =>
  products.reduce((max, product) => Math.max(max, Number(product.id.replace('prd-', '')) || 0), 0) + 1;
const productId = (no: number) => `prd-${String(no).padStart(4, '0')}`;
const codeTaken = (products: MasterProduct[], code: string, exceptId?: string) =>
  products.find((product) => product.id !== exceptId && product.code.toLowerCase() === code.trim().toLowerCase());

export function addProduct(state: AppState, actor: Actor, input: ProductInput, now: string): Outcome<MasterProduct> {
  const denied = inventoryGuard(actor);
  if (denied) return denied;
  if (!input.merchantId) return fail('Choose a merchant.');
  const code = input.code.trim().toUpperCase();
  const problem = checkProduct(code, input.name, input.srp, input.expiryDate || undefined) ?? supplierProblem(cleanSupplier(input.supplier));
  if (problem) return fail(problem);
  if (codeTaken(state.products, code)) return fail(`INV code ${code} is already in the master list.`);
  const supplier = cleanSupplier(input.supplier);
  const product: MasterProduct = {
    id: productId(nextProductNo(state.products)),
    merchantId: input.merchantId,
    code,
    name: input.name.trim().replace(/\s+/g, ' '),
    srp: roundMoney(input.srp),
    ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}),
    ...(supplier ? { supplier } : {}),
    ...(input.category ? { category: normalizeCategory(input.category) } : {}),
    stock: 0,
    branchStock: emptySplit(),
    reorderLevel: 10,
  };
  return {
    ok: true,
    state: { ...logged(state, actor, now, 'Master list: product added', [`${code} ${product.name}, SRP ${product.srp}`], {}), products: [...state.products, product] },
    value: product,
  };
}

export interface ProductPatch {
  code?: string;
  name?: string;
  srp?: number;
  /** null clears the expiry. */
  expiryDate?: string | null;
  /** Empty or null clears the supplier. */
  supplier?: string | null;
  /** Empty or null clears the category. */
  category?: Category | '' | null;
}

export function updateProduct(state: AppState, actor: Actor, id: string, patch: ProductPatch, now: string): Outcome<MasterProduct> {
  const denied = inventoryGuard(actor);
  if (denied) return denied;
  const product = state.products.find((candidate) => candidate.id === id);
  if (!product) return fail('Product not found.');
  const code = (patch.code ?? product.code).trim().toUpperCase();
  const name = (patch.name ?? product.name).trim().replace(/\s+/g, ' ');
  const srp = patch.srp ?? product.srp;
  const expiry = patch.expiryDate === undefined ? product.expiryDate : patch.expiryDate || undefined;
  const supplier = patch.supplier === undefined ? product.supplier ?? '' : cleanSupplier(patch.supplier);
  const problem = checkProduct(code, name, srp, expiry) ?? supplierProblem(supplier);
  if (problem) return fail(problem);
  if (codeTaken(state.products, code, id)) return fail(`INV code ${code} is already in the master list.`);
  const category = patch.category === undefined ? product.category : patch.category ? normalizeCategory(patch.category) : undefined;
  const { expiryDate: _old, supplier: _oldSupplier, category: _oldCategory, ...rest } = product;
  void _old;
  void _oldSupplier;
  void _oldCategory;
  const next: MasterProduct = { ...rest, code, name, srp: roundMoney(srp), ...(expiry ? { expiryDate: expiry } : {}), ...(supplier ? { supplier } : {}), ...(category ? { category } : {}) };
  if (next.code === product.code && next.name === product.name && next.srp === product.srp && next.expiryDate === product.expiryDate && (next.supplier ?? '') === (product.supplier ?? '') && next.category === product.category) return fail('Nothing was changed.');
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, 'Master list: product changed', [`${product.code} ${product.name} (SRP ${product.srp}) -> ${next.code} ${next.name} (SRP ${next.srp})`], {}),
      products: state.products.map((candidate) => (candidate.id === id ? next : candidate)),
    },
    value: next,
  };
}

export function deleteProduct(state: AppState, actor: Actor, id: string, now: string): Outcome<MasterProduct> {
  const denied = inventoryGuard(actor);
  if (denied) return denied;
  const product = state.products.find((candidate) => candidate.id === id);
  if (!product) return fail('Product not found.');
  const used = state.items.filter((item) => item.parts?.some((part) => part.productId === id));
  if (used.length > 0) {
    return fail(`${product.name} cannot be deleted: it is part of ${used.length} SKU${used.length === 1 ? '' : 's'} (${used.slice(0, 3).map((item) => item.sku).join(', ')}${used.length > 3 ? ', …' : ''}).`);
  }
  return {
    ok: true,
    state: { ...logged(state, actor, now, 'Master list: product deleted', [`${product.code} ${product.name}`], {}), products: state.products.filter((candidate) => candidate.id !== id) },
    value: product,
  };
}

/** One line of an uploaded sheet. Everything arrives as text, exactly as typed in the cell. */
export interface ProductRow {
  row: number;
  code: string;
  name: string;
  srp: string | number;
  expiry?: string;
  supplier?: string;
  category?: string;
}

export interface ProductImportPlan {
  /** Rows that add a product. */
  creates: { row: number; input: ProductInput }[];
  /** Rows that change a product with the same INV code (same merchant). */
  updates: { row: number; id: string; before: MasterProduct; patch: ProductPatch }[];
  unchanged: number;
  errors: string[];
}

const MAX_IMPORT_ROWS = 2000;

/** Reads a number typed in a cell: "1,490.00" and "₱990" are fine. */
export const readNumber = (value: string | number | undefined): number => {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').replace(/[₱,\s]/g, '').replace(/^php/i, '');
  return text === '' ? NaN : Number(text);
};

/** Checks a whole sheet for one merchant without changing anything. A known INV code updates that product. */
export function planProductImport(state: AppState, merchantId: string, rows: ProductRow[]): ProductImportPlan {
  const plan: ProductImportPlan = { creates: [], updates: [], unchanged: 0, errors: [] };
  if (!merchantId) return { ...plan, errors: ['Choose the merchant first.'] };
  if (rows.length === 0) return { ...plan, errors: ['The file has no product rows.'] };
  if (rows.length > MAX_IMPORT_ROWS) return { ...plan, errors: [`Too many rows (${rows.length}). Upload up to ${MAX_IMPORT_ROWS} at a time.`] };
  const seen = new Map<string, number>();
  for (const line of rows) {
    const code = String(line.code ?? '').trim().toUpperCase();
    const name = String(line.name ?? '').trim().replace(/\s+/g, ' ');
    const srp = readNumber(line.srp);
    const expiry = String(line.expiry ?? '').trim();
    const supplier = cleanSupplier(line.supplier);
    const categoryText = String(line.category ?? '').trim();
    const category = categoryText ? normalizeCategory(categoryText) : undefined;
    const fail_ = (message: string) => plan.errors.push(`Row ${line.row}: ${message}`);
    const problem = checkProduct(code, name, srp, expiry || undefined) ?? supplierProblem(supplier);
    if (problem) {
      fail_(problem);
      continue;
    }
    if (seen.has(code.toLowerCase())) {
      fail_(`INV code ${code} is also on row ${seen.get(code.toLowerCase())}.`);
      continue;
    }
    seen.set(code.toLowerCase(), line.row);
    const existing = codeTaken(state.products, code);
    if (!existing) {
      plan.creates.push({ row: line.row, input: { merchantId, code, name, srp, ...(expiry ? { expiryDate: expiry } : {}), ...(supplier ? { supplier } : {}), ...(category ? { category } : {}) } });
      continue;
    }
    if (existing.merchantId !== merchantId) {
      fail_(`INV code ${code} already belongs to another merchant.`);
      continue;
    }
    const patch: ProductPatch = {};
    if (existing.name !== name) patch.name = name;
    if (existing.srp !== roundMoney(srp)) patch.srp = srp;
    // An empty expiry cell leaves the saved expiry alone. A date replaces it.
    if (expiry && existing.expiryDate !== expiry) patch.expiryDate = expiry;
    // Same for the supplier: an empty cell keeps the saved one.
    if (supplier && (existing.supplier ?? '') !== supplier) patch.supplier = supplier;
    // And the category: an empty cell keeps the saved one.
    if (category && existing.category !== category) patch.category = category;
    if (Object.keys(patch).length === 0) plan.unchanged += 1;
    else plan.updates.push({ row: line.row, id: existing.id, before: existing, patch });
  }
  return plan;
}

const joinErrors = (errors: string[]) => `${errors.slice(0, 8).join('\n')}${errors.length > 8 ? `\n…and ${errors.length - 8} more.` : ''}`;

/** Adds new products and updates known ones, all or nothing: one bad row and nothing is saved. */
export function importProducts(
  state: AppState,
  actor: Actor,
  merchantId: string,
  rows: ProductRow[],
  now: string,
): Outcome<{ created: number; updated: number; unchanged: number }> {
  const denied = inventoryGuard(actor);
  if (denied) return denied;
  const plan = planProductImport(state, merchantId, rows);
  if (plan.errors.length > 0) return fail(joinErrors(plan.errors));
  if (plan.creates.length + plan.updates.length === 0) return fail('Nothing to import: every row is already in the master list.');
  let products = [...state.products];
  let no = nextProductNo(products);
  for (const create of plan.creates) {
    products.push({
      id: productId(no++),
      merchantId,
      code: create.input.code,
      name: create.input.name,
      srp: roundMoney(create.input.srp),
      ...(create.input.expiryDate ? { expiryDate: create.input.expiryDate } : {}),
      ...(create.input.supplier ? { supplier: create.input.supplier } : {}),
      ...(create.input.category ? { category: normalizeCategory(create.input.category) } : {}),
      stock: 0,
      branchStock: emptySplit(),
      reorderLevel: 10,
    });
  }
  products = products.map((product) => {
    const update = plan.updates.find((candidate) => candidate.id === product.id);
    if (!update) return product;
    return {
      ...product,
      ...(update.patch.name ? { name: update.patch.name } : {}),
      ...(update.patch.srp ? { srp: roundMoney(update.patch.srp) } : {}),
      ...(update.patch.expiryDate ? { expiryDate: update.patch.expiryDate } : {}),
      ...(update.patch.supplier ? { supplier: update.patch.supplier } : {}),
      ...(update.patch.category ? { category: normalizeCategory(update.patch.category) } : {}),
    };
  });
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, 'Master list imported', [`${plan.creates.length} added, ${plan.updates.length} updated, ${plan.unchanged} unchanged`], {}),
      products,
    },
    value: { created: plan.creates.length, updated: plan.updates.length, unchanged: plan.unchanged },
  };
}

export interface NewSkuInput {
  merchantId: string;
  sku: string;
  /** Bundle name. Optional when the SKU is one product with nothing free: it takes the product's name. */
  name: string;
  category: InventoryItem['category'];
  /** What is inside, from the master list. The SRP and the piece count are worked out from it. */
  parts?: SkuPart[];
  /** Older way, used only when `parts` is not given: merchant SRP per unit, PHP. */
  unitPrice?: number;
  /** Older way: pieces inside the SKU. */
  qty?: number;
  /** Make it a reseller package: buying it makes the buyer a reseller. Needs `parts`. */
  resellerPackage?: boolean;
}

/** What a reseller package contains, in words: "5 x Organic Barley Grass (+1 free) + 2 x Spirulina". */
export function packageInclusions(parts: SkuPart[], products: MasterProduct[]): string {
  return parts
    .map((part) => `${part.qty + part.free > 0 && part.qty === 0 ? part.free : part.qty} × ${products.find((p) => p.id === part.productId)?.name ?? 'product'}${part.qty > 0 && part.free > 0 ? ` (+${part.free} free)` : ''}${part.qty === 0 ? ' (free)' : ''}`)
    .join(' + ');
}

/**
 * Adds a new SKU. It exists in Inventory (so stock can be received) but cannot be sold until
 * one of its packages is approved and goes live. The SKU code must be new.
 *
 * Built from master-list products: net SRP = sum of SRP x qty (free pieces cost nothing), pieces inside =
 * qty + free of every product (each piece adds the +5 HKD SF). Expiry is the earliest expiry among the products.
 */
export function addSku(state: AppState, actor: Actor, input: NewSkuInput, now: string): Outcome<InventoryItem> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const sku = input.sku.trim().toUpperCase();
  const problem = validateSkuCode(sku, state.items);
  if (problem) return fail(problem);
  if (!input.merchantId) return fail('Choose a merchant.');
  if (input.resellerPackage && !input.parts?.length) return fail('A reseller package must be built from master-list products.');

  let name = input.name.trim();
  let unitPrice = input.unitPrice ?? NaN;
  let pieces = input.qty ?? NaN;
  let expiry = '2099-12-31';
  let parts: SkuPart[] | undefined;

  if (input.parts) {
    if (input.parts.length === 0) return fail('Add at least one product.');
    if (input.parts.length > 30) return fail('A SKU can hold up to 30 products.');
    unitPrice = 0;
    pieces = 0;
    const used = new Set<string>();
    const expiries: string[] = [];
    for (const part of input.parts) {
      const product = state.products.find((candidate) => candidate.id === part.productId);
      if (!product) return fail('A product in this SKU is not in the master list.');
      if (product.merchantId !== input.merchantId) return fail(`${product.name} belongs to another merchant.`);
      if (used.has(product.id)) return fail(`${product.name} is listed twice. Put the full qty on one line.`);
      used.add(product.id);
      if (!Number.isInteger(part.qty) || part.qty < 0 || part.qty > 99 || !Number.isInteger(part.free) || part.free < 0 || part.free > 99) {
        return fail(`${product.name}: qty and free must be whole numbers from 0 to 99.`);
      }
      if (part.qty + part.free < 1) return fail(`${product.name}: enter a qty or a free piece.`);
      unitPrice += product.srp * part.qty;
      pieces += part.qty + part.free;
      if (product.expiryDate) expiries.push(product.expiryDate);
    }
    if (expiries.length > 0) expiry = expiries.sort()[0];
    if (!name) {
      const only = state.products.find((candidate) => candidate.id === input.parts![0].productId)!;
      if (input.parts.length === 1) name = only.name;
    }
    parts = input.parts.map((part) => ({ productId: part.productId, qty: part.qty, free: part.free }));
  }

  if (name.length < 2) return fail(input.parts && input.parts.length > 1 ? 'Enter the bundle name.' : 'Enter the product name.');
  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1_000_000) {
    return fail(input.parts ? 'A SKU needs at least one paid product: free pieces alone have no SRP.' : 'Enter the merchant SRP (PHP) above 0.');
  }
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > 99) {
    return fail('Pieces in the SKU must be a whole number from 1 to 99.');
  }

  const next = state.items.reduce((max, item) => Math.max(max, Number(item.id.replace('itm-', '')) || 0), 0) + 1;
  const id = `itm-${String(next).padStart(3, '0')}`;
  const item: InventoryItem = {
    id,
    merchantId: input.merchantId,
    sku,
    name,
    category: input.category,
    unitCost: 0,
    unitPrice: roundMoney(unitPrice),
    stock: 0,
    branchStock: { 'shueng-wan': 0, central: 0 },
    reorderLevel: 10,
    expiryDate: expiry,
    ...(parts ? { parts, masterSrp: roundMoney(unitPrice) } : {}),
    ...(parts && input.resellerPackage ? { package: { inclusions: packageInclusions(parts, state.products), priceHkd: state.costing.settings.packageHkd } } : {}),
  };
  const row: CostingRow = {
    id: `cst-${String(next).padStart(3, '0')}`,
    itemId: id,
    qty: pieces,
    pickupPriceHkd: null,
    status: 'draft',
    live: null,
  };
  const inside = parts
    ? ` = ${parts.map((part) => `${state.products.find((p) => p.id === part.productId)!.code} x${part.qty}${part.free ? ` +${part.free} free` : ''}`).join(', ')}`
    : '';
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, 'New SKU added', [`${sku} ${item.name}, SRP ${item.unitPrice}, ${pieces} pc${pieces === 1 ? '' : 's'}${inside}`], {
        rows: [...state.costing.rows, row],
      }),
      items: [...state.items, item],
    },
    value: item,
  };
}

/** One line of an uploaded SKU sheet: SKU CODE, BUNDLE NAME, PRODUCT, QTY, FREE (and CATEGORY if present). */
export interface SkuRow {
  row: number;
  sku: string;
  bundleName?: string;
  /** INV code or product name from the master list. */
  product: string;
  qty?: string | number;
  free?: string | number;
  category?: string;
}

export interface SkuImportPlan {
  state: AppState;
  created: InventoryItem[];
  errors: string[];
}

const FREE_WORDS = /^(y|yes|free|x|true|1\s*free)$/i;

/**
 * Checks a SKU sheet without saving. Rows with the same SKU code are one bundle. PRODUCT is matched to the
 * master list by INV code or by name, so the merchant is found from the product. FREE is the number of free
 * pieces of that product; the word "yes" (or "free") means this line's qty is all free.
 */
export function planSkuImport(state: AppState, actor: Actor, rows: SkuRow[], now: string, defaultCategory?: InventoryItem['category']): SkuImportPlan {
  const plan: SkuImportPlan = { state, created: [], errors: [] };
  if (rows.length === 0) return { ...plan, errors: ['The file has no SKU rows.'] };
  if (rows.length > MAX_IMPORT_ROWS) return { ...plan, errors: [`Too many rows (${rows.length}). Upload up to ${MAX_IMPORT_ROWS} at a time.`] };

  const groups = new Map<string, SkuRow[]>();
  for (const line of rows) {
    const key = String(line.sku ?? '').trim().toUpperCase();
    if (!key) {
      plan.errors.push(`Row ${line.row}: SKU code is empty.`);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }

  for (const [sku, lines] of groups) {
    const first = lines[0].row;
    const where = (message: string) => plan.errors.push(`SKU ${sku} (row ${first}): ${message}`);
    const parts: SkuPart[] = [];
    let merchantId = '';
    let bad = false;
    for (const line of lines) {
      const text = String(line.product ?? '').trim();
      if (!text) {
        plan.errors.push(`Row ${line.row}: product is empty.`);
        bad = true;
        continue;
      }
      const byCode = state.products.filter((product) => product.code.toLowerCase() === text.toLowerCase());
      const matches = byCode.length > 0 ? byCode : state.products.filter((product) => normName(product.name) === normName(text));
      if (matches.length === 0) {
        plan.errors.push(`Row ${line.row}: "${text}" is not in the master list. Add it in Inventory → Master list first.`);
        bad = true;
        continue;
      }
      if (matches.length > 1) {
        plan.errors.push(`Row ${line.row}: "${text}" matches products of more than one merchant. Use the INV code.`);
        bad = true;
        continue;
      }
      const product = matches[0];
      if (merchantId && merchantId !== product.merchantId) {
        plan.errors.push(`Row ${line.row}: "${product.name}" belongs to another merchant than the other products of ${sku}.`);
        bad = true;
        continue;
      }
      merchantId = product.merchantId;
      const freeText = String(line.free ?? '').trim();
      const qtyText = String(line.qty ?? '').trim();
      let qty = qtyText === '' ? NaN : readNumber(qtyText);
      let free = 0;
      if (FREE_WORDS.test(freeText)) {
        free = Number.isFinite(qty) ? qty : NaN;
        qty = 0;
      } else if (freeText !== '' && freeText !== '0') {
        free = readNumber(freeText);
        if (qtyText === '') qty = 0;
      } else if (qtyText === '') {
        plan.errors.push(`Row ${line.row}: enter the qty.`);
        bad = true;
        continue;
      }
      if (!Number.isInteger(qty) || !Number.isInteger(free)) {
        plan.errors.push(`Row ${line.row}: qty and free must be whole numbers.`);
        bad = true;
        continue;
      }
      const same = parts.find((part) => part.productId === product.id);
      if (same) {
        same.qty += qty;
        same.free += free;
      } else parts.push({ productId: product.id, qty, free });
    }
    if (bad) continue;
    const bundleName = lines.map((line) => String(line.bundleName ?? '').trim()).find(Boolean) ?? '';
    const categoryText = lines.map((line) => String(line.category ?? '').trim()).find(Boolean);
    const result = addSku(plan.state, actor, { merchantId, sku, name: bundleName, category: categoryText ? normalizeCategory(categoryText) : defaultCategory ?? 'Food Supplements', parts }, now);
    if (!result.ok) {
      where(result.error);
      continue;
    }
    plan.state = result.state;
    plan.created.push(result.value);
  }
  return plan;
}

/** Makes every SKU in the sheet as a draft, all or nothing. */
export function importSkus(state: AppState, actor: Actor, rows: SkuRow[], now: string, defaultCategory?: InventoryItem['category']): Outcome<{ created: number }> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const plan = planSkuImport(state, actor, rows, now, defaultCategory);
  if (plan.errors.length > 0) return fail(joinErrors(plan.errors));
  return { ok: true, state: plan.state, value: { created: plan.created.length } };
}

/**
 * Sets the Net SRP of a SKU: the amount SDSI really remits to the merchant per SKU, and the base of the
 * mark-up (SDSI's top-up). It starts as the master-list total; a discounted twin pack can be lower.
 * A new SRP makes the package a draft again: approve it and go live to use it. Orders already placed keep their own price.
 */
export function setSkuSrp(state: AppState, actor: Actor, itemId: string, srp: number, now: string): Outcome<InventoryItem> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail('SKU not found.');
  if (!Number.isFinite(srp) || srp <= 0 || srp > 1_000_000) return fail('Enter the Net SRP above 0.');
  const next = roundMoney(srp);
  if (next === item.unitPrice) return fail('The Net SRP is already that amount.');
  const updated: InventoryItem = { ...item, unitPrice: next };
  const rows = state.costing.rows.map((row) =>
    row.itemId === itemId ? { ...row, status: 'draft' as const, approvedBy: undefined, approvedAt: undefined } : row,
  );
  const vs = item.masterSrp !== undefined ? ` (master list ${item.masterSrp})` : '';
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, 'Net SRP changed', [`${item.sku}: ${item.unitPrice} -> ${next}${vs}`], { rows }),
      items: state.items.map((candidate) => (candidate.id === itemId ? updated : candidate)),
    },
    value: updated,
  };
}

/**
 * Changes the category of one or more SKUs (Food Supplements or Beauty Products). Costing and stock are not touched.
 * Orders already placed keep the category they were placed with.
 */
export function setSkuCategory(state: AppState, actor: Actor, itemIds: string[], category: InventoryItem['category'], now: string): Outcome<number> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  if (category !== 'Food Supplements' && category !== 'Beauty Products') return fail('Choose Food Supplements or Beauty Products.');
  const ids = new Set(itemIds);
  const targets = state.items.filter((item) => ids.has(item.id));
  if (targets.length === 0) return fail('Choose at least one SKU.');
  if (targets.length !== ids.size) return fail('A SKU was not found.');
  const changing = targets.filter((item) => item.category !== category);
  if (changing.length === 0) return fail(`They are already ${category}.`);
  const changeIds = new Set(changing.map((item) => item.id));
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, `Category set to ${category}`, [changing.length > 6 ? `${changing.length} SKUs` : changing.map((item) => item.sku).join(', ')], {}),
      items: state.items.map((item) => (changeIds.has(item.id) ? { ...item, category } : item)),
    },
    value: changing.length,
  };
}

/** Marks a SKU as the reseller package (buying it makes the buyer a reseller), or takes the mark off. */
export function setSkuPackage(state: AppState, actor: Actor, itemId: string, on: boolean, now: string): Outcome<boolean> {
  const denied = costingGuard(actor);
  if (denied) return denied;
  const item = state.items.find((candidate) => candidate.id === itemId);
  if (!item) return fail('SKU not found.');
  if (on === Boolean(item.package)) return fail(on ? `${item.sku} is already a reseller package.` : `${item.sku} is not a reseller package.`);
  if (on && !item.parts?.length) return fail('Only a SKU built from master-list products can be a reseller package.');
  const row = state.costing.rows.find((candidate) => candidate.itemId === itemId);
  const next: InventoryItem = { ...item };
  if (on) next.package = { inclusions: packageInclusions(item.parts!, state.products), priceHkd: row?.pickupPriceHkd ?? state.costing.settings.packageHkd };
  else delete next.package;
  return {
    ok: true,
    state: {
      ...logged(state, actor, now, on ? 'SKU set as reseller package' : 'SKU is no longer a reseller package', [item.sku], {}),
      items: state.items.map((candidate) => (candidate.id === itemId ? next : candidate)),
    },
    value: on,
  };
}

/** Convenience for the UI: the full computed line for one costing row. */
export const costingLine = (state: AppState, row: CostingRow) => {
  const item = state.items.find((candidate) => candidate.id === row.itemId);
  return item ? computeCosting(item.unitPrice, row.qty, row.pickupPriceHkd, state.costing.settings) : null;
};

// ---------------------------------------------------------------------------
// Reversal of a delivered order. No grace period: the cashier gives a note, the inventory clerk
// or admin approves. Orders in a closed remittance week are locked.
// ---------------------------------------------------------------------------

/** True while an undo request for the order waits for approval. The order is frozen until it is decided. */
const hasPendingUndo = (state: AppState, orderId: string): boolean =>
  state.reversals.some((request) => request.orderId === orderId && request.status === 'pending');

const reversalId = (state: AppState) => `REV-${String(state.reversals.length + 1).padStart(6, '0')}`;

/** Statuses a cashier can ask to undo. Each goes back one step, with a note and an approval. */
const UNDOABLE: OrderStatus[] = ['delivered', 'shipped', 'rts', 'cancelled'];

export function requestReversal(
  state: AppState,
  actor: Actor,
  orderId: string,
  note: string,
  now: string,
): Outcome<ReversalRequest> {
  if (!isStaff(actor)) return fail('Only the cashier or admin can request an undo.');
  if (note.trim().length < 5) return fail('Write a note: why is this being undone?');
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (!order) return fail('Order not found.');
  if (!canHandle(actor, order)) return fail(wrongBranch);
  if (!UNDOABLE.includes(order.status)) return fail('This order has nothing to undo.');
  if (order.status === 'delivered' && hasPackage(state, order)) {
    return fail('A delivered reseller package cannot be undone here: the buyer is already a reseller.');
  }
  if (order.status === 'cancelled' && order.source === 'walk-in') {
    return fail('A voided counter sale cannot be brought back. Ring up a new sale.');
  }
  if (order.status === 'delivered' && remittedOrderIds(state.remittances).has(order.id)) {
    return fail('This order is already in a closed remittance week and is locked. Ask the admin for an adjustment.');
  }
  if (order.status === 'rts' && order.returnReceiptId) {
    return fail('The returned goods were already received back. Reject that receipt first.');
  }
  if (hasPendingUndo(state, orderId)) {
    return fail('An undo request for this order is already waiting for approval.');
  }
  const request: ReversalRequest = {
    id: reversalId(state),
    orderId,
    merchantId: order.merchantId,
    fromStatus: order.status,
    requestedBy: actor.id,
    requestedAt: now,
    note: note.trim(),
    status: 'pending',
  };
  return { ok: true, state: { ...state, reversals: [request, ...state.reversals] }, value: request };
}

/** What an approved undo does: the order goes back one step. */
export function undoTarget(order: Order): OrderStatus {
  switch (order.status) {
    case 'delivered':
      return order.source === 'walk-in' ? 'cancelled' : order.terms === 'COD' ? 'shipped' : 'packed';
    case 'shipped':
      return 'packed';
    case 'rts':
      return 'shipped';
    default:
      return order.packedAt ? 'packed' : 'pending';
  }
}

export function approveReversal(
  state: AppState,
  actor: Actor,
  requestId: string,
  now: string,
): Outcome<ReversalRequest> {
  if (!canApprove(actor)) return fail('Only the inventory clerk or admin can approve an undo.');
  const request = state.reversals.find((candidate) => candidate.id === requestId);
  if (!request) return fail('Request not found.');
  if (request.status !== 'pending') return fail('This request was already decided.');
  if (request.requestedBy === actor.id) return fail('You cannot approve your own request.');
  const order = state.orders.find((candidate) => candidate.id === request.orderId);
  if (!order || order.status !== request.fromStatus) {
    return fail(`This order is no longer ${request.fromStatus}.`);
  }
  if (order.status === 'delivered' && remittedOrderIds(state.remittances).has(order.id)) {
    return fail('This order is already in a closed remittance week and is locked.');
  }
  if (order.status === 'rts' && order.returnReceiptId) {
    return fail('The returned goods were already received back. Reject that receipt first.');
  }

  const target = undoTarget(order);
  let change: Partial<Order> = { status: target };
  let items = state.items;
  let products = state.products;
  const give = (sign: 1 | -1) => {
    ({ items, products } = moveUnits(state.items, state.products, order.branch ?? LEGACY_BRANCH, demandOfLines(state.items, order.lines), sign));
  };

  if (order.status === 'delivered') {
    change = { ...change, deliveredAt: undefined, paymentMethod: undefined, topUpRate: undefined };
    if (target === 'cancelled') {
      change = { ...change, cancelledAt: now, cancelReason: `Sale voided (${request.id})` };
    }
    // Counter and pickup sales took the goods off the shelf at delivery. Put them back.
    if (order.terms !== 'COD') give(1);
  } else if (order.status === 'shipped') {
    // The goods never left: back on the shelf, waybill cleared.
    change = { ...change, shippedAt: undefined, waybill: undefined };
    give(1);
  } else if (order.status === 'rts') {
    change = { ...change, rtsAt: undefined, rtsReason: undefined };
  } else {
    // "Not delivered" before shipping: the stock is reserved again, so there must be enough of it.
    const book = makeStockBook(state.items, state.products, state.orders);
    const taken = new Map<string, number>();
    for (const line of order.lines) {
      const item = state.items.find((candidate) => candidate.id === line.itemId);
      if (!item || line.quantity > book.available(item, order.branch ?? LEGACY_BRANCH, taken)) {
        return fail(`Not enough "${line.name}" available at this branch to reserve this order again.`);
      }
      for (const [unitId, qty] of demandOfLines(state.items, [line])) taken.set(unitId, (taken.get(unitId) ?? 0) + qty);
    }
    change = { ...change, cancelledAt: undefined, cancelReason: undefined };
  }

  const next: ReversalRequest = { ...request, status: 'approved', decidedBy: actor.id, decidedAt: now };
  return {
    ok: true,
    state: {
      ...state,
      items,
      products,
      orders: state.orders.map((candidate) => (candidate.id === order.id ? { ...candidate, ...change } : candidate)),
      reversals: state.reversals.map((candidate) => (candidate.id === requestId ? next : candidate)),
    },
    value: next,
  };
}

export function rejectReversal(
  state: AppState,
  actor: Actor,
  requestId: string,
  reason: string,
  now: string,
): Outcome<ReversalRequest> {
  if (!canApprove(actor)) return fail('Only the inventory clerk or admin can reject a reversal.');
  if (reason.trim().length < 3) return fail('Write why the request is rejected.');
  const request = state.reversals.find((candidate) => candidate.id === requestId);
  if (!request) return fail('Request not found.');
  if (request.status !== 'pending') return fail('This request was already decided.');
  const next: ReversalRequest = {
    ...request,
    status: 'rejected',
    decidedBy: actor.id,
    decidedAt: now,
    decisionNote: reason.trim(),
  };
  return {
    ok: true,
    state: { ...state, reversals: state.reversals.map((candidate) => (candidate.id === requestId ? next : candidate)) },
    value: next,
  };
}

// ---------------------------------------------------------------------------
// Remittances: weekly cutoff (Monday to Sunday), then release with the SF advance deducted.
// ---------------------------------------------------------------------------

/** Closes a finished week for every merchant that had deliveries. Locks those orders. */
export function closeWeek(
  state: AppState,
  actor: Actor,
  weekStart: string,
  now: string,
): Outcome<Remittance[]> {
  if (actor.role !== 'admin') return fail('Only the admin can close a week.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekStartOf(weekStart) !== weekStart) {
    return fail('A week starts on a Monday.');
  }
  if (weekEndOf(weekStart) >= dateOf(now)) return fail('This week is not over yet.');
  if (state.remittances.some((remittance) => remittance.weekStart === weekStart)) {
    return fail('This week is already closed.');
  }
  const created = buildWeekRemittances(
    state.orders,
    weekStart,
    state.remittances.length + 1,
    actor.id,
    now,
  );
  if (created.length === 0) return fail('No delivered orders in this week.');
  return { ok: true, state: { ...state, remittances: [...created.reverse(), ...state.remittances] }, value: created };
}

/** Admin releases the payout: sets the SF advance to deduct, the release date and a reference. */
/** The cashier releases the payout (money sent, reference noted). The admin still has to approve it. */
export function submitRelease(
  state: AppState,
  actor: Actor,
  remittanceId: string,
  input: {
    releasedDate: string;
    deductionPhp: number;
    deductionNote: string;
    /** Correction of an earlier payout: + adds to this payout, - takes away from it. */
    adjustmentPhp?: number;
    adjustmentNote?: string;
    reference: string;
  },
  now: string,
): Outcome<Remittance> {
  if (actor.role !== 'cashier') return fail('Only the cashier releases a payout. The admin approves it.');
  const remittance = state.remittances.find((candidate) => candidate.id === remittanceId);
  if (!remittance) return fail('Remittance not found.');
  if (remittance.status === 'released') return fail('This payout was already released.');
  if (remittance.status === 'submitted') return fail('This payout is waiting for the admin to approve it.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.releasedDate)) return fail('Enter the release date.');
  if (input.releasedDate > dateOf(now)) return fail('The release date cannot be in the future.');
  if (input.releasedDate <= remittance.weekEnd) return fail('The payout is released after the week ends.');
  if (!Number.isFinite(input.deductionPhp) || input.deductionPhp < 0) return fail('The deduction cannot be negative.');
  if (input.deductionPhp > remittance.netPayable) return fail('The deduction is more than the net payable.');
  if (input.deductionPhp > 0 && input.deductionNote.trim().length < 3) {
    return fail('Write what the deduction is (the actual SF PH to HK advanced).');
  }
  if (input.reference.trim().length < 2) return fail('Enter a payment reference.');
  const adjustment = roundMoney(input.adjustmentPhp ?? 0);
  if (!Number.isFinite(adjustment)) return fail('Enter the adjustment as a number.');
  if (adjustment !== 0 && (input.adjustmentNote ?? '').trim().length < 3) {
    return fail('Write what the adjustment corrects (which earlier payout).');
  }
  const deduction = roundMoney(input.deductionPhp);
  if (remittance.netPayable - deduction + adjustment < 0) return fail('The payout cannot be negative.');
  const next: Remittance = {
    ...remittance,
    deductionPhp: deduction,
    deductionNote: input.deductionNote.trim(),
    adjustmentPhp: adjustment,
    adjustmentNote: adjustment === 0 ? '' : (input.adjustmentNote ?? '').trim(),
    payoutPhp: roundMoney(remittance.netPayable - deduction + adjustment),
    status: 'submitted',
    releasedBy: actor.id,
    releasedAt: now,
    rejectNote: undefined,
    releasedDate: input.releasedDate,
    reference: input.reference.trim(),
  };
  return {
    ok: true,
    state: { ...state, remittances: state.remittances.map((candidate) => (candidate.id === remittanceId ? next : candidate)) },
    value: next,
  };
}

export function approveRelease(state: AppState, actor: Actor, remittanceId: string, now: string): Outcome<Remittance> {
  if (actor.role !== 'admin') return fail('Only the admin can approve a payout release.');
  const remittance = state.remittances.find((candidate) => candidate.id === remittanceId);
  if (!remittance) return fail('Remittance not found.');
  if (remittance.status !== 'submitted') return fail('This payout is not waiting for approval.');
  const next: Remittance = { ...remittance, status: 'released', approvedBy: actor.id, approvedAt: now };
  return {
    ok: true,
    state: { ...state, remittances: state.remittances.map((candidate) => (candidate.id === remittanceId ? next : candidate)) },
    value: next,
  };
}

/** The admin sends a release back to the cashier (wrong amount, wrong reference). Nothing is paid out. */
export function rejectRelease(
  state: AppState,
  actor: Actor,
  remittanceId: string,
  reason: string,
  now: string,
): Outcome<Remittance> {
  if (actor.role !== 'admin') return fail('Only the admin can send a release back.');
  const remittance = state.remittances.find((candidate) => candidate.id === remittanceId);
  if (!remittance) return fail('Remittance not found.');
  if (remittance.status !== 'submitted') return fail('This payout is not waiting for approval.');
  if (reason.trim().length < 3) return fail('Write why it is sent back.');
  const next: Remittance = {
    ...remittance,
    status: 'pending',
    rejectNote: reason.trim(),
    releasedBy: undefined,
    releasedAt: undefined,
    releasedDate: undefined,
    reference: undefined,
  };
  return {
    ok: true,
    state: { ...state, remittances: state.remittances.map((candidate) => (candidate.id === remittanceId ? next : candidate)) },
    value: next,
  };
}


export interface ResellerApplication {
  name: string;
  email: string;
  mobile: string;
  /** A referral code of an active reseller. */
  refCode?: string;
  branch: BranchId;
  /** The package SKU chosen. */
  itemId: string;
}

/**
 * Someone applies to become a reseller from the landing page: they pick a package and a branch and leave their
 * details. This is a pickup order that waits for the cashier. Their account is made when the cashier delivers it.
 */
export function applyForReseller(state: AppState, input: ResellerApplication, now: string): Outcome<Order> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const mobile = input.mobile.trim();
  if (name.length < 2) return fail('Enter your full name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email. Your sign-in details are sent there.');
  if (mobile.replace(/\D/g, '').length < 6) return fail('Enter your mobile number.');
  if (!branchOk(input.branch)) return fail('Choose where you will pick it up.');
  const item = state.items.find((candidate) => candidate.id === input.itemId);
  if (!item?.package) return fail('Choose a reseller package.');
  if (state.users.some((user) => user.email?.toLowerCase() === email)) return fail('That email already has an account. Sign in instead.');
  if (state.orders.some((order) => order.applicant?.email === email && order.status !== 'cancelled' && order.status !== 'rts')) {
    return fail('You already applied with this email. Pay at the counter to finish.');
  }
  let sponsorId: string | undefined;
  const code = input.refCode?.trim().toUpperCase();
  if (code) {
    const sponsor = state.users.find((user) => user.refCode === code && isActiveReseller(state, user.id));
    if (!sponsor) return fail('We could not find that referral code. Check it or leave it empty.');
    sponsorId = sponsor.id;
  }
  const built = buildLines(state, [{ itemId: item.id, quantity: 1 }], dateOf(now), undefined, input.branch);
  if (!built.ok) return fail(built.error);
  const charges = orderCharges([{ itemId: item.id, quantity: 1 }], state.costing);
  if (!charges) return fail('This package has no live price.');
  const { ids, poSeq } = nextPoids(state, 1);
  const order: Order = {
    id: ids[0],
    merchantId: item.merchantId,
    source: 'reseller',
    createdBy: 'public',
    createdAt: now,
    customerName: name,
    contactNo: mobile,
    address: '',
    notes: '',
    terms: 'COP',
    lines: built.lines,
    status: 'pending',
    pickupHkd: charges.pickupHkd,
    amountHkd: charges.pickupHkd,
    branch: input.branch,
    applicant: { name, email, mobile, ...(sponsorId ? { sponsorId } : {}) },
  };
  return { ok: true, state: { ...state, poSeq, orders: [order, ...state.orders] }, value: order };
}

/** A reseller replaces the temporary username and password from the email. DEMO: stored as typed. */
export function changeCredentials(
  state: AppState,
  userId: string,
  username: string,
  password: string,
): Outcome<User> {
  const user = state.users.find((candidate) => candidate.id === userId);
  if (!user) return fail('Account not found.');
  const name = username.trim().toLowerCase();
  const problem = validateCredentials(state.users, userId, name, password);
  if (problem) return fail(problem);
  const updated: User = { ...user, username: name, password, mustChange: false };
  return { ok: true, state: { ...state, users: state.users.map((candidate) => (candidate.id === userId ? updated : candidate)) }, value: updated };
}
