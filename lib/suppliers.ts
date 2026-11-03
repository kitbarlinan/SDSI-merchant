/**
 * Which supplier a merchant sells best. A delivered line is a SKU; its net SRP total is shared out over the
 * products inside it (in proportion to SRP x qty), and each product belongs to a supplier (optional).
 */
import { roundMoney } from './format';
import type { InventoryItem, MasterProduct, SaleLine } from './types';

export const NO_SUPPLIER = 'No supplier set';

export interface SupplierSales {
  supplier: string;
  merchantId: string;
  /** Net SRP of the sales that came from this supplier's products, PHP. */
  revenue: number;
  /** Pieces sold (free pieces included). */
  units: number;
}

export function salesBySupplier(lines: SaleLine[], items: InventoryItem[], products: MasterProduct[]): SupplierSales[] {
  const rows = new Map<string, SupplierSales>();
  const row = (merchantId: string, supplier: string) => {
    const key = `${merchantId}|${supplier.toLowerCase()}`;
    if (!rows.has(key)) rows.set(key, { supplier, merchantId, revenue: 0, units: 0 });
    return rows.get(key)!;
  };
  for (const line of lines) {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item?.parts?.length) {
      const target = row(line.merchantId, NO_SUPPLIER);
      target.revenue += line.total;
      target.units += line.quantity;
      continue;
    }
    const weights = item.parts.map((part) => ({ part, product: products.find((product) => product.id === part.productId), weight: (products.find((product) => product.id === part.productId)?.srp ?? 0) * part.qty }));
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    for (const { part, product, weight } of weights) {
      const target = row(line.merchantId, product?.supplier || NO_SUPPLIER);
      target.revenue += total > 0 ? (line.total * weight) / total : line.total / weights.length;
      target.units += (part.qty + part.free) * line.quantity;
    }
  }
  return [...rows.values()].map((entry) => ({ ...entry, revenue: roundMoney(entry.revenue) })).sort((a, b) => b.revenue - a.revenue);
}
