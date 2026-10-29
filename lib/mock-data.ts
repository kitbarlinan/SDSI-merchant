import { DEFAULT_TOP_UP_PERCENT } from './brand';
import { roundMoney } from './format';
import { addDays, weekdayOf } from './period';
import type {
  InventoryItem,
  Merchant,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  User,
} from './types';

/**
 * Demo data is generated deterministically (same output on server and client).
 * "Today" for the demo is fixed so the order history always lines up with the stock levels below.
 */
export const MOCK_TODAY = '2026-10-29';
const HISTORY_DAYS = 75;

export const MOCK_MERCHANTS: Merchant[] = [
  { id: 'mrc-1', name: 'Green Leaf Naturals', color: '#059669' },
  { id: 'mrc-2', name: 'Pure Glow Beauty', color: '#e11d48' },
  { id: 'mrc-3', name: 'Everyday Health PH', color: '#0284c7' },
];

export const MOCK_USERS: User[] = [
  { id: 'usr-admin', name: 'Kit', role: 'admin' },
  { id: 'usr-cashier', name: 'Ana Cruz', role: 'cashier' },
  { id: 'usr-m1', name: 'Liza Fernandez', role: 'merchant', merchantId: 'mrc-1' },
  { id: 'usr-m2', name: 'Bea Ramirez', role: 'merchant', merchantId: 'mrc-2' },
  { id: 'usr-m3', name: 'Carlo Navarro', role: 'merchant', merchantId: 'mrc-3' },
];

const CASHIER_ID = 'usr-cashier';

/**
 * Each merchant's stock held in SDSI's warehouse (on hand).
 * Mix of healthy, low, out-of-stock and soon-to-expire items on purpose.
 */
export const MOCK_INVENTORY: InventoryItem[] = [
  // Green Leaf Naturals
  {
    id: 'itm-001',
    merchantId: 'mrc-1',
    sku: 'GRN-BAR-200',
    name: 'Organic Barley Grass Powder 200g',
    category: 'Greens & Superfoods',
    unitCost: 420,
    unitPrice: 690,
    stock: 140,
    reorderLevel: 40,
    expiryDate: '2027-09-30',
  },
  {
    id: 'itm-002',
    merchantId: 'mrc-1',
    sku: 'GRN-BAR-TAB',
    name: 'Barley Grass Tablets (120s)',
    category: 'Greens & Superfoods',
    unitCost: 310,
    unitPrice: 520,
    stock: 14, // low stock
    reorderLevel: 20,
    expiryDate: '2027-06-30',
  },
  {
    id: 'itm-003',
    merchantId: 'mrc-1',
    sku: 'GRN-SPI-100',
    name: 'Spirulina 500mg (100 tablets)',
    category: 'Greens & Superfoods',
    unitCost: 260,
    unitPrice: 420,
    stock: 60,
    reorderLevel: 20,
    expiryDate: '2026-12-20', // expiring soon
  },
  {
    id: 'itm-004',
    merchantId: 'mrc-1',
    sku: 'HRB-MAL-60',
    name: 'Malunggay Capsules (60s)',
    category: 'Herbal',
    unitCost: 150,
    unitPrice: 260,
    stock: 18, // low stock + expiring soon
    reorderLevel: 25,
    expiryDate: '2027-01-25',
  },
  // Pure Glow Beauty
  {
    id: 'itm-008',
    merchantId: 'mrc-2',
    sku: 'BTY-GLU-30',
    name: 'Glutathione + Vitamin C (30 caps)',
    category: 'Beauty & Skin',
    unitCost: 480,
    unitPrice: 799,
    stock: 70,
    reorderLevel: 20,
    expiryDate: '2027-05-31',
  },
  {
    id: 'itm-009',
    merchantId: 'mrc-2',
    sku: 'BTY-COL-300',
    name: 'Collagen Peptides Powder 300g',
    category: 'Beauty & Skin',
    unitCost: 520,
    unitPrice: 880,
    stock: 26, // running low on cover
    reorderLevel: 15,
    expiryDate: '2027-07-31',
  },
  // Everyday Health PH
  {
    id: 'itm-005',
    merchantId: 'mrc-3',
    sku: 'HRB-LUY-60',
    name: 'Turmeric + Black Pepper (60 caps)',
    category: 'Herbal',
    unitCost: 175,
    unitPrice: 295,
    stock: 90,
    reorderLevel: 25,
    expiryDate: '2027-10-31',
  },
  {
    id: 'itm-006',
    merchantId: 'mrc-3',
    sku: 'VIT-CZN-100',
    name: 'Vitamin C 500mg + Zinc (100 tabs)',
    category: 'Vitamins & Minerals',
    unitCost: 190,
    unitPrice: 320,
    stock: 120,
    reorderLevel: 40,
    expiryDate: '2027-12-31',
  },
  {
    id: 'itm-007',
    merchantId: 'mrc-3',
    sku: 'VIT-D3-60',
    name: 'Vitamin D3 1000 IU (60 softgels)',
    category: 'Vitamins & Minerals',
    unitCost: 210,
    unitPrice: 350,
    stock: 0, // out of stock
    reorderLevel: 20,
    expiryDate: '2027-08-31',
  },
  {
    id: 'itm-010',
    merchantId: 'mrc-3',
    sku: 'HRT-OM3-60',
    name: 'Omega-3 Fish Oil 1000mg (60 softgels)',
    category: 'Heart & Wellness',
    unitCost: 240,
    unitPrice: 399,
    stock: 40,
    reorderLevel: 20,
    expiryDate: '2027-11-30',
  },
];

// ---------------------------------------------------------------------------
// Order history generator
// ---------------------------------------------------------------------------

/** Small seeded PRNG so the demo data never changes between renders. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rand: () => number, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1][0];
}

const PRODUCT_WEIGHTS: Record<string, { weight: number; maxQty: number }> = {
  'itm-001': { weight: 24, maxQty: 4 },
  'itm-002': { weight: 8, maxQty: 3 },
  'itm-003': { weight: 8, maxQty: 3 },
  'itm-004': { weight: 10, maxQty: 3 },
  'itm-005': { weight: 9, maxQty: 3 },
  'itm-006': { weight: 14, maxQty: 3 },
  'itm-007': { weight: 8, maxQty: 3 },
  'itm-008': { weight: 9, maxQty: 2 },
  'itm-009': { weight: 6, maxQty: 2 },
  'itm-010': { weight: 8, maxQty: 3 },
};

/** Average merchant orders per day. */
const MERCHANT_VOLUME: Record<string, number> = { 'mrc-1': 1.8, 'mrc-2': 0.9, 'mrc-3': 1.4 };

const CUSTOMERS = [
  'Maria Santos',
  'Juan dela Cruz',
  'Angela Reyes',
  'Joel Villanueva',
  'Katrina Mendoza',
  'Ramon Bautista',
  'Liza Fernandez',
  'Carlo Navarro',
  'Jasmine Aquino',
  'Paolo Castillo',
  'Rhea Domingo',
  'Mark Gonzales',
  'Noel Pascual',
  'Cecilia Tan',
  'Dennis Lim',
  'Aileen Soriano',
];

const ADDRESSES = [
  'Brgy. Sumacab Este, Cabanatuan City',
  'Brgy. Bitas, Cabanatuan City',
  'Brgy. Zulueta, Cabanatuan City',
  'Brgy. Caalibangbangan, Cabanatuan City',
  'Brgy. Poblacion, Gapan City',
  'Brgy. Sto. Niño, San Jose City',
  'Brgy. Bantug, Science City of Muñoz',
  'Brgy. Mabini, Palayan City',
];

const CANCEL_REASONS = [
  'Customer unreachable',
  'Customer refused the order',
  'Wrong or incomplete address',
  'Customer could not pay on delivery',
];

const WALK_IN_PAYMENTS: readonly (readonly [PaymentMethod, number])[] = [
  ['Cash', 50],
  ['GCash', 30],
  ['Maya', 10],
  ['Card', 10],
];
const COD_PAYMENTS: readonly (readonly [PaymentMethod, number])[] = [
  ['Cash', 70],
  ['GCash', 20],
  ['Bank Transfer', 5],
  ['Maya', 5],
];
const COP_PAYMENTS: readonly (readonly [PaymentMethod, number])[] = [
  ['Cash', 55],
  ['GCash', 30],
  ['Maya', 10],
  ['Bank Transfer', 5],
];

const two = (value: number): string => String(value).padStart(2, '0');
const stamp = (date: string, hour: number, minute: number): string =>
  `${date}T${two(Math.min(hour, 21))}:${two(minute)}`;

function generateOrders(): Order[] {
  const rand = mulberry32(20261029);
  const orders: Order[] = [];
  const reserved = new Map<string, number>();
  let counter = 1000;

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = addDays(MOCK_TODAY, -offset);
    const dayOfMonth = Number(date.slice(8, 10));
    const weekday = weekdayOf(date);
    const progress = 1 - offset / HISTORY_DAYS; // business grows a little over time
    const isPayday = [14, 15, 16, 29, 30, 31, 1].includes(dayOfMonth);

    for (const merchant of MOCK_MERCHANTS) {
      const catalog = MOCK_INVENTORY.filter((item) => item.merchantId === merchant.id);
      const volume = MERCHANT_VOLUME[merchant.id];
      let mean = volume * (weekday === 0 || weekday === 6 ? 1.2 : 1) * (1 + progress * 0.45);
      if (isPayday) mean += volume * 0.7;
      const count = Math.max(0, Math.round(mean + (rand() - 0.5) * 2));

      for (let n = 0; n < count; n += 1) {
        // 1 to 3 different products per order.
        const lineCount = Math.min(catalog.length, rand() < 0.6 ? 1 : rand() < 0.85 ? 2 : 3);
        const pool = [...catalog];
        const lines: OrderLine[] = [];
        for (let l = 0; l < lineCount; l += 1) {
          const item = pickWeighted(
            rand,
            pool.map((candidate) => [candidate, PRODUCT_WEIGHTS[candidate.id].weight] as const),
          );
          pool.splice(pool.indexOf(item), 1);
          const { maxQty } = PRODUCT_WEIGHTS[item.id];
          const quantity = rand() < 0.6 ? 1 : 2 + Math.floor(rand() * (maxQty - 1));
          const unitPrice = rand() < 0.08 ? Math.round(item.unitPrice * 0.9) : item.unitPrice;
          lines.push({
            itemId: item.id,
            sku: item.sku,
            name: item.name,
            category: item.category,
            quantity,
            unitPrice,
            unitCost: item.unitCost,
            total: roundMoney(quantity * unitPrice),
          });
        }

        const walkIn = rand() < 0.14;
        const terms = walkIn || rand() < 0.45 ? 'COP' : 'COD';
        const hour = offset === 0 ? 8 + Math.floor(rand() * 4) : 9 + Math.floor(rand() * 9);
        const minute = Math.floor(rand() * 60);
        const createdAt = stamp(date, hour, minute);

        let status: OrderStatus;
        const roll = rand();
        if (walkIn) status = 'delivered';
        else if (offset >= 2) status = roll < 0.93 ? 'delivered' : 'cancelled';
        else if (offset === 1) {
          status = roll < 0.72 ? 'delivered' : roll < 0.87 ? 'packed' : roll < 0.95 ? 'pending' : 'cancelled';
        } else {
          status = roll < 0.45 ? 'pending' : roll < 0.7 ? 'packed' : roll < 0.95 ? 'delivered' : 'cancelled';
        }

        // Open orders must fit in the stock that is actually on the shelf.
        if (status === 'pending' || status === 'packed') {
          const fits = lines.every((line) => {
            const item = MOCK_INVENTORY.find((candidate) => candidate.id === line.itemId)!;
            return item.stock - (reserved.get(line.itemId) ?? 0) >= line.quantity;
          });
          if (fits) {
            for (const line of lines) {
              reserved.set(line.itemId, (reserved.get(line.itemId) ?? 0) + line.quantity);
            }
          } else {
            status = 'delivered';
          }
        }

        counter += 1;
        const merchantUser = MOCK_USERS.find((user) => user.merchantId === merchant.id)!;
        const order: Order = {
          id: `ORD-${counter}`,
          merchantId: merchant.id,
          source: walkIn ? 'walk-in' : 'merchant',
          createdBy: walkIn ? CASHIER_ID : merchantUser.id,
          createdAt,
          customerName: walkIn ? null : CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
          contactNo: walkIn ? '' : `09${Math.floor(100000000 + rand() * 899999999)}`,
          address: !walkIn && terms === 'COD' ? ADDRESSES[Math.floor(rand() * ADDRESSES.length)] : '',
          notes: '',
          terms,
          lines,
          status,
        };

        if (status !== 'pending') {
          order.packedAt = stamp(date, hour + 1, minute);
          order.handledBy = CASHIER_ID;
        }
        if (status === 'delivered') {
          const nextDay = !walkIn && offset >= 1 && terms === 'COD' && rand() < 0.25;
          order.deliveredAt = walkIn
            ? createdAt
            : nextDay
              ? stamp(addDays(date, 1), 9 + Math.floor(rand() * 8), Math.floor(rand() * 60))
              : stamp(date, hour + 1 + Math.floor(rand() * 4), Math.floor(rand() * 60));
          order.paymentMethod = pickWeighted(
            rand,
            walkIn ? WALK_IN_PAYMENTS : terms === 'COD' ? COD_PAYMENTS : COP_PAYMENTS,
          );
          order.topUpRate = DEFAULT_TOP_UP_PERCENT;
        }
        if (status === 'cancelled') {
          order.cancelledAt = stamp(date, hour + 2, minute);
          order.cancelReason = CANCEL_REASONS[Math.floor(rand() * CANCEL_REASONS.length)];
        }
        orders.push(order);
      }
    }
  }

  return orders.sort((a, b) =>
    a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
  );
}

export const MOCK_ORDERS: Order[] = generateOrders();
