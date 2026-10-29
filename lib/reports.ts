import { roundMoney } from './format';
import { eachDay, inRange, type Range } from './period';
import type { Category, Sale } from './types';

export interface Summary {
  revenue: number;
  cogs: number;
  profit: number;
  /** Profit as a percentage of revenue. */
  margin: number;
  transactions: number;
  units: number;
  avgOrder: number;
}

export function summarize(sales: Sale[]): Summary {
  let revenue = 0;
  let cogs = 0;
  let units = 0;
  for (const sale of sales) {
    revenue += sale.total;
    cogs += sale.quantity * sale.unitCost;
    units += sale.quantity;
  }
  revenue = roundMoney(revenue);
  cogs = roundMoney(cogs);
  const profit = roundMoney(revenue - cogs);
  return {
    revenue,
    cogs,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    transactions: sales.length,
    units,
    avgOrder: sales.length > 0 ? roundMoney(revenue / sales.length) : 0,
  };
}

export const filterByRange = (sales: Sale[], range: Range): Sale[] =>
  sales.filter((sale) => inRange(sale.date, range));

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
  orders: number;
}

/** Daily totals between start and end; switches to weekly buckets for very long ranges. */
export function buildTrend(sales: Sale[], start: string, end: string): TrendPoint[] {
  const byDay = new Map<string, { revenue: number; cogs: number; orders: number }>();
  for (const sale of sales) {
    if (sale.date < start || sale.date > end) continue;
    const entry = byDay.get(sale.date) ?? { revenue: 0, cogs: 0, orders: 0 };
    entry.revenue += sale.total;
    entry.cogs += sale.quantity * sale.unitCost;
    entry.orders += 1;
    byDay.set(sale.date, entry);
  }

  const days = eachDay(start, end);
  const bucket = days.length > 90 ? 7 : 1;
  const points: TrendPoint[] = [];
  for (let index = 0; index < days.length; index += bucket) {
    const slice = days.slice(index, index + bucket);
    let revenue = 0;
    let cogs = 0;
    let orders = 0;
    for (const day of slice) {
      const entry = byDay.get(day);
      if (entry) {
        revenue += entry.revenue;
        cogs += entry.cogs;
        orders += entry.orders;
      }
    }
    points.push({
      date: slice[0],
      endDate: slice[slice.length - 1],
      revenue: roundMoney(revenue),
      cogs: roundMoney(cogs),
      profit: roundMoney(revenue - cogs),
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
  /** Share of total revenue, 0-100. */
  share: number;
}

/** Groups sales by any key (category, channel, payment method, customer...). Sorted by revenue. */
export function groupSales(sales: Sale[], keyOf: (sale: Sale) => string): GroupRow[] {
  const map = new Map<string, GroupRow>();
  let total = 0;
  for (const sale of sales) {
    total += sale.total;
    const key = keyOf(sale);
    const row = map.get(key) ?? { key, orders: 0, units: 0, revenue: 0, cogs: 0, profit: 0, share: 0 };
    row.orders += 1;
    row.units += sale.quantity;
    row.revenue = roundMoney(row.revenue + sale.total);
    row.cogs = roundMoney(row.cogs + sale.quantity * sale.unitCost);
    row.profit = roundMoney(row.revenue - row.cogs);
    map.set(key, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, share: total > 0 ? (row.revenue / total) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export interface ItemBreakdownRow extends GroupRow {
  itemId: string;
  name: string;
  sku: string;
  category: Category;
}

export function breakdownByItem(sales: Sale[]): ItemBreakdownRow[] {
  const meta = new Map<string, { name: string; sku: string; category: Category }>();
  for (const sale of sales) {
    if (!meta.has(sale.itemId)) {
      meta.set(sale.itemId, { name: sale.itemName, sku: sale.sku, category: sale.category });
    }
  }
  return groupSales(sales, (sale) => sale.itemId).map((row) => {
    const info = meta.get(row.key)!;
    return { ...row, itemId: row.key, ...info };
  });
}

/** Newest first, ties broken by sale id. */
export function sortLedger(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) =>
    a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date),
  );
}
