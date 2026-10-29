import { roundMoney } from './format';
import type { PaymentMethod, Sale } from './types';

export interface Summary {
  revenue: number;
  cogs: number;
  profit: number;
  /** Profit as a percentage of revenue. */
  margin: number;
  transactions: number;
  units: number;
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
  };
}

export interface ItemBreakdownRow {
  itemId: string;
  name: string;
  sku: string;
  units: number;
  revenue: number;
  cogs: number;
  profit: number;
}

export function breakdownByItem(sales: Sale[]): ItemBreakdownRow[] {
  const map = new Map<string, ItemBreakdownRow>();
  for (const sale of sales) {
    const row = map.get(sale.itemId) ?? {
      itemId: sale.itemId,
      name: sale.itemName,
      sku: sale.sku,
      units: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
    };
    row.units += sale.quantity;
    row.revenue = roundMoney(row.revenue + sale.total);
    row.cogs = roundMoney(row.cogs + sale.quantity * sale.unitCost);
    row.profit = roundMoney(row.revenue - row.cogs);
    map.set(sale.itemId, row);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

export interface PaymentBreakdownRow {
  method: PaymentMethod;
  count: number;
  revenue: number;
  /** Share of total revenue, 0-100. */
  share: number;
}

export function breakdownByPayment(sales: Sale[]): PaymentBreakdownRow[] {
  const map = new Map<PaymentMethod, PaymentBreakdownRow>();
  let total = 0;
  for (const sale of sales) {
    total += sale.total;
    const row = map.get(sale.paymentMethod) ?? {
      method: sale.paymentMethod,
      count: 0,
      revenue: 0,
      share: 0,
    };
    row.count += 1;
    row.revenue = roundMoney(row.revenue + sale.total);
    map.set(sale.paymentMethod, row);
  }
  return [...map.values()]
    .map((row) => ({ ...row, share: total > 0 ? (row.revenue / total) * 100 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Newest first, ties broken by sale id. */
export function sortLedger(sales: Sale[]): Sale[] {
  return [...sales].sort((a, b) =>
    a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date),
  );
}
