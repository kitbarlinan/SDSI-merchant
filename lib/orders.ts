import { formatCurrency, formatHkd, roundMoney } from './format';
import type {
  InventoryItem,
  Order,
  OrderLine,
  OrderStatus,
  OrderTerms,
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
export function reservedByItem(orders: Order[]): Map<string, number> {
  const reserved = new Map<string, number>();
  for (const order of orders) {
    if (!reservesStock(order)) continue;
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
        total: line.total,
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
