import { formatCurrency, formatHkd, roundMoney } from './format';
import { stockAt } from './inventory';
import { BRANCHES, DEFAULT_BRANCH, type BranchId } from './types';
import type {
  InventoryItem,
  Order,
  OrderLine,
  OrderStatus,
  OrderTerms,
  PackageSale,
  SaleLine,
} from './types';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  rts: 'RTS',
  cancelled: 'Not delivered',
};

export const TERMS_LABEL: Record<OrderTerms, string> = {
  COP: 'Cash on pickup',
  COD: 'Cash on delivery',
};

/** Still needs action from the cashier. */
export const isOpen = (order: Order): boolean =>
  order.status === 'pending' || order.status === 'packed' || order.status === 'shipped';

/** Stock is promised to the order but still physically on the shelf. */
export const reservesStock = (order: Order): boolean =>
  order.status === 'pending' || order.status === 'packed';

/** SRP of the order, in PHP. The reseller discount is not taken off it: SDSI carries the discount out of its top-up. */
export const orderTotal = (order: Order): number =>
  roundMoney(order.lines.reduce((sum, line) => sum + line.total, 0));

export const orderUnits = (order: Order): number =>
  order.lines.reduce((sum, line) => sum + line.quantity, 0);

/** SDSI's estimated top-up on one line: Net SRP x the costing mark-up. */
export const lineTopUp = (line: OrderLine, ratePercent: number): number =>
  roundMoney((line.total * ratePercent) / 100);

/** SDSI's top-up on a delivered order. Zero for any other status. */
export function orderTopUp(order: Order): number {
  if (order.status !== 'delivered') return 0;
  const rate = order.topUpRate ?? 0;
  return roundMoney(order.lines.reduce((sum, line) => sum + lineTopUp(line, rate), 0));
}

/** Units promised to pending / packed orders. They are still physically on the shelf. */
export function reservedByItem(orders: Order[], branch?: BranchId): Map<string, number> {
  const reserved = new Map<string, number>();
  for (const order of orders) {
    if (!reservesStock(order)) continue;
    if (branch && (order.branch ?? DEFAULT_BRANCH) !== branch) continue;
    for (const line of order.lines) {
      reserved.set(line.itemId, (reserved.get(line.itemId) ?? 0) + line.quantity);
    }
  }
  return reserved;
}

/** Units on a courier right now: they left the warehouse but are not delivered yet. */
export function inTransitByItem(orders: Order[]): Map<string, number> {
  const transit = new Map<string, number>();
  for (const order of orders) {
    if (order.status !== 'shipped') continue;
    for (const line of order.lines) {
      transit.set(line.itemId, (transit.get(line.itemId) ?? 0) + line.quantity);
    }
  }
  return transit;
}

/** What can still be promised to new orders: on hand minus reserved. */
export const availableOf = (item: InventoryItem, reserved: Map<string, number>): number =>
  Math.max(0, item.stock - (reserved.get(item.id) ?? 0));

/** What can still be promised on one branch: its shelf minus what its pending / packed orders hold. */
export const availableAt = (item: InventoryItem, reservedAtBranch: Map<string, number>, branch: BranchId): number =>
  Math.max(0, stockAt(item, branch) - (reservedAtBranch.get(item.id) ?? 0));

export function activeOrderDate(order: Order): string {
  return order.createdAt.slice(0, 10);
}

/** Delivered orders as one row per line, dated by the day the payment was collected. */
export function flattenDelivered(orders: Order[]): SaleLine[] {
  const lines: SaleLine[] = [];
  for (const order of orders) {
    if (order.status !== 'delivered' || !order.deliveredAt || !order.paymentMethod) continue;
    const rate = order.topUpRate ?? 0;
    order.lines.forEach((line, index) => {
      const net = roundMoney(line.total);
      lines.push({
        id: `${order.id}-${index + 1}`,
        orderId: order.id,
        merchantId: order.merchantId,
        date: order.deliveredAt!.slice(0, 10),
        itemId: line.itemId,
        itemName: line.name,
        sku: line.sku,
        category: line.category,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: line.unitCost,
        total: net,
        gross: roundMoney(net + lineTopUp(line, rate)),
        topUp: lineTopUp(line, rate),
        paymentMethod: order.paymentMethod!,
        terms: order.terms,
        source: order.source,
        customerName: order.customerName,
      });
    });
  }
  return lines;
}

/** Newest first. */
export const sortNewestFirst = (orders: Order[]): Order[] =>
  [...orders].sort((a, b) =>
    a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
  );

/** Oldest first, so the longest-waiting order is packed first. */
export const sortOldestFirst = (orders: Order[]): Order[] => sortNewestFirst(orders).reverse();

/** Total HKD still to collect on open orders (orders without a live price are left out). */
export const toCollectHkd = (orders: Order[]): number =>
  roundMoney(orders.reduce((sum, order) => sum + (order.amountHkd ?? 0), 0));

/** What the customer pays, as text: HKD from the live costing, or the peso Net SRP for older orders without a price. */
export const orderAmountLabel = (order: Order): string =>
  order.amountHkd != null ? formatHkd(order.amountHkd) : formatCurrency(orderTotal(order));

/** Customer price basis of a delivered order: Net SRP plus the mark-up (990 -> 1,485). */
export const orderGross = (order: Order): number => roundMoney(orderTotal(order) + orderTopUp(order));

export interface TierRow {
  kind: 'package' | 'order';
  ref: string;
  /** Who bought. */
  name: string;
  level: number;
  php: number;
  date: string;
  /** Orders count once delivered. Packages always count. */
  earned: boolean;
}

/** Tier income a reseller earns when someone below them buys the package or delivers an order. PHP. */
export function tierIncome(
  sales: PackageSale[],
  orders: Order[],
  userId: string,
): { total: number; pending: number; rows: TierRow[] } {
  const rows: TierRow[] = [];
  for (const sale of sales) {
    // A package that came from an order is counted once, on the sale.
    for (const tier of sale.tiers) {
      if (tier.userId === userId) rows.push({ kind: 'package', ref: sale.id, name: sale.resellerName, level: tier.level, php: tier.php, date: sale.createdAt.slice(0, 10), earned: true });
    }
  }
  for (const order of orders) {
    if (order.status === 'cancelled' || order.status === 'rts') continue;
    for (const tier of order.tiers ?? []) {
      if (tier.userId === userId) rows.push({ kind: 'order', ref: order.id, name: order.customerName ?? 'Walk-in', level: tier.level, php: tier.php, date: order.createdAt.slice(0, 10), earned: order.status === 'delivered' });
    }
  }
  const sum = (list: TierRow[]) => roundMoney(list.reduce((total, row) => total + row.php, 0));
  return {
    total: sum(rows.filter((row) => row.earned)),
    pending: sum(rows.filter((row) => !row.earned)),
    rows: rows.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** What a user sees: a cashier only the orders of their own branch, everyone else all (their own filter applies elsewhere). */
export function ordersForUser(orders: Order[], user: { role: string; branchId?: BranchId } | null): Order[] {
  if (!user || user.role !== 'cashier') return orders;
  return orders.filter((order) => (order.branch ?? DEFAULT_BRANCH) === (user.branchId ?? DEFAULT_BRANCH));
}

/** Stock a buyer could get by switching branch: the other branch's shelf minus what it already holds for orders. */
export function otherBranchStock(
  item: InventoryItem,
  orders: Order[],
  branch: BranchId,
): { branch: string; quantity: number } | undefined {
  const other = BRANCHES.find((candidate) => candidate.id !== branch);
  if (!other) return undefined;
  const held = orders
    .filter((order) => reservesStock(order) && (order.branch ?? DEFAULT_BRANCH) === other.id)
    .reduce((sum, order) => sum + order.lines.filter((line) => line.itemId === item.id).reduce((n, line) => n + line.quantity, 0), 0);
  return { branch: other.name, quantity: Math.max(0, stockAt(item, other.id) - held) };
}
