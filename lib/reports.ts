import { roundMoney } from './format';
import { eachDay, inRange, type Range } from './period';
import type { Category, SaleLine } from './types';

export interface Summary {
  /** Merchant sales (cash collected on delivered orders). Not SDSI revenue. */
  revenue: number;
  cogs: number;
  /** Revenue minus the merchant's own cost of goods. */
  profit: number;
  /** Profit as a percentage of revenue. */
  margin: number;
  orders: number;
  units: number;
  avgOrder: number;
  /** SDSI's fulfillment top-up. This is SDSI's own revenue. */
  topUp: number;
  /** What SDSI remits to the merchant: the Net SRP of what was delivered. The top-up is on top, not taken out of it. */
  netPayable: number;
}

export function summarize(lines: SaleLine[]): Summary {
  let revenue = 0;
  let cogs = 0;
  let units = 0;
  let topUp = 0;
  const orderIds = new Set<string>();
  for (const line of lines) {
    revenue += line.total;
    cogs += line.quantity * line.unitCost;
    units += line.quantity;
    topUp += line.topUp;
    orderIds.add(line.orderId);
  }
  revenue = roundMoney(revenue);
  cogs = roundMoney(cogs);
  topUp = roundMoney(topUp);
  const profit = roundMoney(revenue - cogs);
  return {
    revenue,
    cogs,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    orders: orderIds.size,
    units,
    avgOrder: orderIds.size > 0 ? roundMoney(revenue / orderIds.size) : 0,
    topUp,
    netPayable: roundMoney(revenue),
  };
}

export const filterByRange = (lines: SaleLine[], range: Range): SaleLine[] =>
  lines.filter((line) => inRange(line.date, range));

/** Percent change from previous to current. null when there is nothing to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export interface TrendPoint {
  /** First day covered by this point. */
  date: string;
  /** Last day covered (same as date for daily points). */
  endDate: string;
  revenue: number;
  cogs: number;
  profit: number;
  topUp: number;
  orders: number;
}

/** Daily totals between start and end; switches to weekly buckets for very long ranges. */
export function buildTrend(lines: SaleLine[], start: string, end: string): TrendPoint[] {
  const byDay = new Map<
    string,
    { revenue: number; cogs: number; topUp: number; orderIds: Set<string> }
  >();
  for (const line of lines) {
    if (line.date < start || line.date > end) continue;
    const entry = byDay.get(line.date) ?? {
      revenue: 0,
      cogs: 0,
      topUp: 0,
      orderIds: new Set<string>(),
    };
    entry.revenue += line.total;
    entry.cogs += line.quantity * line.unitCost;
    entry.topUp += line.topUp;
    entry.orderIds.add(line.orderId);
    byDay.set(line.date, entry);
  }

  const days = eachDay(start, end);
  const bucket = days.length > 90 ? 7 : 1;
  const points: TrendPoint[] = [];
  for (let index = 0; index < days.length; index += bucket) {
    const slice = days.slice(index, index + bucket);
    let revenue = 0;
    let cogs = 0;
    let topUp = 0;
    let orders = 0;
    for (const day of slice) {
      const entry = byDay.get(day);
      if (entry) {
        revenue += entry.revenue;
        cogs += entry.cogs;
        topUp += entry.topUp;
        orders += entry.orderIds.size;
      }
    }
    points.push({
      date: slice[0],
      endDate: slice[slice.length - 1],
      revenue: roundMoney(revenue),
      cogs: roundMoney(cogs),
      profit: roundMoney(revenue - cogs),
      topUp: roundMoney(topUp),
      orders,
    });
  }
  return points;
}

export interface GroupRow {
  key: string;
  orders: number;
  units: number;
  revenue: number;
  cogs: number;
  profit: number;
  topUp: number;
  /** Share of total revenue, 0-100. */
  share: number;
}

/** Groups sale lines by any key (merchant, category, payment method, terms...). Sorted by revenue. */
export function groupSales(lines: SaleLine[], keyOf: (line: SaleLine) => string): GroupRow[] {
  const map = new Map<string, GroupRow & { orderIds: Set<string> }>();
  let total = 0;
  for (const line of lines) {
    total += line.total;
    const key = keyOf(line);
    const row = map.get(key) ?? {
      key,
      orders: 0,
      units: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
      topUp: 0,
      share: 0,
      orderIds: new Set<string>(),
    };
    row.orderIds.add(line.orderId);
    row.units += line.quantity;
    row.revenue = roundMoney(row.revenue + line.total);
    row.cogs = roundMoney(row.cogs + line.quantity * line.unitCost);
    row.profit = roundMoney(row.revenue - row.cogs);
    row.topUp = roundMoney(row.topUp + line.topUp);
    map.set(key, row);
  }
  return [...map.values()]
    .map(({ orderIds, ...row }) => ({
      ...row,
      orders: orderIds.size,
      share: total > 0 ? (row.revenue / total) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface ItemBreakdownRow extends GroupRow {
  itemId: string;
  name: string;
  sku: string;
  category: Category;
}

export function breakdownByItem(lines: SaleLine[]): ItemBreakdownRow[] {
  const meta = new Map<string, { name: string; sku: string; category: Category }>();
  for (const line of lines) {
    if (!meta.has(line.itemId)) {
      meta.set(line.itemId, { name: line.itemName, sku: line.sku, category: line.category });
    }
  }
  return groupSales(lines, (line) => line.itemId).map((row) => ({
    ...row,
    itemId: row.key,
    ...meta.get(row.key)!,
  }));
}
