/**
 * Stock is kept per PRODUCT (the master list). A SKU or bundle owns no stock of its own: it is sellable as
 * long as every product inside has enough on hand. Older SKUs that were typed in by hand (no `parts`) keep
 * their own stock, so they count as a "stock unit" themselves.
 *
 * A stock unit is therefore either a master-list product (id prd-…) or an older SKU (id itm-…).
 */
import { BRANCHES, DEFAULT_BRANCH, type BranchId, type InventoryItem, type MasterProduct, type Order, type SaleLine } from './types';

type Holder = { stock: number; branchStock?: Record<BranchId, number> };

/** On hand on one branch's shelf. Missing split = everything is at SDSI Sheung Wan. */
export const holderAt = (holder: Holder, branch: BranchId): number =>
  holder.branchStock?.[branch] ?? (branch === DEFAULT_BRANCH ? holder.stock : 0);

export const emptySplit = (): Record<BranchId, number> => ({ 'shueng-wan': 0, central: 0 });

/** What a SKU is made of, as stock units: the stock unit and how many of it one SKU uses (qty + free). */
export function unitsOf(item: Pick<InventoryItem, 'id' | 'parts'>): { unitId: string; per: number }[] {
  const parts = (item.parts ?? []).filter((part) => part.qty + part.free > 0);
  return parts.length > 0 ? parts.map((part) => ({ unitId: part.productId, per: part.qty + part.free })) : [{ unitId: item.id, per: 1 }];
}

/** Stock units taken by some lines. A line is a SKU (itemId) or, for stock in/out, a product (productId). */
export function demandOfLines(
  items: Pick<InventoryItem, 'id' | 'parts'>[],
  lines: { itemId?: string; productId?: string; quantity: number }[],
): Map<string, number> {
  const demand = new Map<string, number>();
  const add = (id: string, qty: number) => demand.set(id, (demand.get(id) ?? 0) + qty);
  for (const line of lines) {
    if (line.productId) {
      add(line.productId, line.quantity);
      continue;
    }
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item) {
      if (line.itemId) add(line.itemId, line.quantity);
      continue;
    }
    for (const unit of unitsOf(item)) add(unit.unitId, unit.per * line.quantity);
  }
  return demand;
}

const reserving = (order: Order) => order.status === 'pending' || order.status === 'packed';

/** Stock units promised to pending / packed orders (still on the shelf). One branch, or all. */
export function reservedUnits(orders: Order[], items: Pick<InventoryItem, 'id' | 'parts'>[], branch?: BranchId): Map<string, number> {
  const reservedOrders = orders.filter((order) => reserving(order) && (!branch || (order.branch ?? DEFAULT_BRANCH) === branch));
  return demandOfLines(items, reservedOrders.flatMap((order) => order.lines));
}

/** Stock units on a courier right now. */
export function inTransitUnits(orders: Order[], items: Pick<InventoryItem, 'id' | 'parts'>[]): Map<string, number> {
  return demandOfLines(items, orders.filter((order) => order.status === 'shipped').flatMap((order) => order.lines));
}

/** Earliest expiry of what is inside, so a new batch entered in the master list lifts the block. Older SKUs keep their own. */
export function expiryOf(item: InventoryItem, products: MasterProduct[]): string {
  if (!item.parts?.length) return item.expiryDate;
  const dates = item.parts.map((part) => products.find((product) => product.id === part.productId)?.expiryDate).filter((date): date is string => !!date);
  return dates.length > 0 ? [...dates].sort()[0] : '2099-12-31';
}

export interface StockBook {
  /** Sellable units from what is physically on the shelf (all branches, or one). */
  onHand(item: InventoryItem, branch?: BranchId): number;
  /** Sellable units still free to promise: shelf minus what open orders hold. `extra` = units already taken by other lines of the same order. */
  available(item: InventoryItem, branch?: BranchId, extra?: Map<string, number>): number;
  /** What the other branch could sell. */
  elsewhere(item: InventoryItem, branch: BranchId): { branch: string; quantity: number } | undefined;
}

export function makeStockBook(items: InventoryItem[], products: MasterProduct[], orders: Order[]): StockBook {
  const holders = new Map<string, Holder>();
  for (const item of items) if (!item.parts?.length) holders.set(item.id, item);
  for (const product of products) holders.set(product.id, product);
  const cache = new Map<string, Map<string, number>>();
  const reservedAt = (branch?: BranchId) => {
    const key = branch ?? '*';
    if (!cache.has(key)) cache.set(key, reservedUnits(orders, items, branch));
    return cache.get(key)!;
  };
  const shelf = (unitId: string, branch?: BranchId) => {
    const holder = holders.get(unitId);
    return holder ? (branch ? holderAt(holder, branch) : holder.stock) : 0;
  };
  const sellable = (item: InventoryItem, branch: BranchId | undefined, held?: Map<string, number>, extra?: Map<string, number>) =>
    Math.max(
      0,
      Math.min(
        ...unitsOf(item).map(({ unitId, per }) =>
          Math.floor(Math.max(0, shelf(unitId, branch) - (held?.get(unitId) ?? 0) - (extra?.get(unitId) ?? 0)) / per),
        ),
      ),
    );
  return {
    onHand: (item, branch) => sellable(item, branch),
    available: (item, branch, extra) => sellable(item, branch, reservedAt(branch), extra),
    elsewhere: (item, branch) => {
      const other = BRANCHES.find((candidate) => candidate.id !== branch);
      return other ? { branch: other.name, quantity: sellable(item, other.id, reservedAt(other.id)) } : undefined;
    },
  };
}

/** Stock on a branch for one unit, minus what open orders hold there (never below 0). */
export const unitAvailableAt = (holder: Holder, held: Map<string, number>, id: string, branch: BranchId): number =>
  Math.max(0, holderAt(holder, branch) - (held.get(id) ?? 0));

/**
 * The rows the Inventory page, the alerts and the dashboard count: every master-list product, plus any older SKU
 * that still keeps its own stock. Shaped like an item so the same screens can show them.
 */
export function stockUnits(items: InventoryItem[], products: MasterProduct[]): InventoryItem[] {
  const categoryOf = new Map<string, InventoryItem['category']>();
  for (const item of items) for (const part of item.parts ?? []) if (!categoryOf.has(part.productId)) categoryOf.set(part.productId, item.category);
  const fromProducts = products.map(
    (product): InventoryItem => ({
      id: product.id,
      merchantId: product.merchantId,
      sku: product.code,
      name: product.name,
      category: product.category ?? categoryOf.get(product.id) ?? 'Food Supplements',
      unitCost: 0,
      unitPrice: product.srp,
      stock: product.stock,
      branchStock: product.branchStock ?? { ...emptySplit(), [DEFAULT_BRANCH]: product.stock },
      reorderLevel: product.reorderLevel,
      expiryDate: product.expiryDate ?? '2099-12-31',
    }),
  );
  return [...fromProducts, ...items.filter((item) => !item.parts?.length)];
}

/** Moves stock units on one branch (sign +1 in, -1 out), keeping every total in step. */
export function moveUnits(
  items: InventoryItem[],
  products: MasterProduct[],
  branch: BranchId,
  demand: Map<string, number>,
  sign: 1 | -1,
): { items: InventoryItem[]; products: MasterProduct[] } {
  const move = <T extends Holder>(holder: T, amount: number): T => {
    const split = { 'shueng-wan': holderAt(holder, 'shueng-wan'), central: holderAt(holder, 'central') } as Record<BranchId, number>;
    split[branch] += sign * amount;
    return { ...holder, stock: holder.stock + sign * amount, branchStock: split };
  };
  return {
    items: items.map((item) => (!item.parts?.length && demand.has(item.id) ? move(item, demand.get(item.id)!) : item)),
    products: products.map((product) => (demand.has(product.id) ? move(product, demand.get(product.id)!) : product)),
  };
}

/** Units sold per stock unit over the last 30 days. */
export function recentUnitsByUnit(
  lines: SaleLine[],
  items: Pick<InventoryItem, 'id' | 'parts'>[],
  today: string,
  windowDays: number,
  addDays: (date: string, days: number) => string,
): Map<string, number> {
  const start = addDays(today, -(windowDays - 1));
  return demandOfLines(
    items,
    lines.filter((line) => line.date >= start && line.date <= today).map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
  );
}

/** Products saved before stock was kept per product have no stock fields yet. */
export const normalizeProduct = (product: MasterProduct): MasterProduct => ({
  ...product,
  stock: product.stock ?? 0,
  branchStock: product.branchStock ?? { ...emptySplit(), [DEFAULT_BRANCH]: product.stock ?? 0 },
  reorderLevel: product.reorderLevel ?? 10,
});
