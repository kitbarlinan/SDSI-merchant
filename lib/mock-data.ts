import { roundMoney } from './format';
import { addDays, weekdayOf } from './period';
import type { InventoryItem, PaymentMethod, Sale, SalesChannel } from './types';

/**
 * Demo data is generated deterministically (same output on server and client).
 * "Today" for the demo is fixed so the sales history always lines up with the stock levels below.
 */
export const MOCK_TODAY = '2026-10-29';
const HISTORY_DAYS = 75;

/** Current stock levels. Mix of healthy, low, out-of-stock and soon-to-expire items on purpose. */
export const MOCK_INVENTORY: InventoryItem[] = [
  {
    id: 'itm-001',
    sku: 'GRN-BAR-200',
    name: 'Organic Barley Grass Powder 200g',
    category: 'Greens & Superfoods',
    unitCost: 420,
    unitPrice: 690,
    stock: 96,
    reorderLevel: 40,
    expiryDate: '2027-09-30',
  },
  {
    id: 'itm-002',
    sku: 'GRN-BAR-TAB',
    name: 'Barley Grass Tablets (120s)',
    category: 'Greens & Superfoods',
    unitCost: 310,
    unitPrice: 520,
    stock: 11, // low stock
    reorderLevel: 15,
    expiryDate: '2027-06-30',
  },
  {
    id: 'itm-003',
    sku: 'GRN-SPI-100',
    name: 'Spirulina 500mg (100 tablets)',
    category: 'Greens & Superfoods',
    unitCost: 260,
    unitPrice: 420,
    stock: 32,
    reorderLevel: 15,
    expiryDate: '2026-12-20', // expiring soon
  },
  {
    id: 'itm-004',
    sku: 'HRB-MAL-60',
    name: 'Malunggay Capsules (60s)',
    category: 'Herbal',
    unitCost: 150,
    unitPrice: 260,
    stock: 8, // low stock + expiring soon
    reorderLevel: 12,
    expiryDate: '2027-01-25',
  },
  {
    id: 'itm-005',
    sku: 'HRB-LUY-60',
    name: 'Turmeric + Black Pepper (60 caps)',
    category: 'Herbal',
    unitCost: 175,
    unitPrice: 295,
    stock: 50,
    reorderLevel: 15,
    expiryDate: '2027-10-31',
  },
  {
    id: 'itm-006',
    sku: 'VIT-CZN-100',
    name: 'Vitamin C 500mg + Zinc (100 tabs)',
    category: 'Vitamins & Minerals',
    unitCost: 190,
    unitPrice: 320,
    stock: 57,
    reorderLevel: 25,
    expiryDate: '2027-12-31',
  },
  {
    id: 'itm-007',
    sku: 'VIT-D3-60',
    name: 'Vitamin D3 1000 IU (60 softgels)',
    category: 'Vitamins & Minerals',
    unitCost: 210,
    unitPrice: 350,
    stock: 0, // out of stock
    reorderLevel: 12,
    expiryDate: '2027-08-31',
  },
  {
    id: 'itm-008',
    sku: 'BTY-GLU-30',
    name: 'Glutathione + Vitamin C (30 caps)',
    category: 'Beauty & Skin',
    unitCost: 480,
    unitPrice: 799,
    stock: 21,
    reorderLevel: 10,
    expiryDate: '2027-05-31',
  },
  {
    id: 'itm-009',
    sku: 'BTY-COL-300',
    name: 'Collagen Peptides Powder 300g',
    category: 'Beauty & Skin',
    unitCost: 520,
    unitPrice: 880,
    stock: 14,
    reorderLevel: 10,
    expiryDate: '2027-07-31',
  },
  {
    id: 'itm-010',
    sku: 'HRT-OM3-60',
    name: 'Omega-3 Fish Oil 1000mg (60 softgels)',
    category: 'Heart & Wellness',
    unitCost: 240,
    unitPrice: 399,
    stock: 29,
    reorderLevel: 12,
    expiryDate: '2027-11-30',
  },
];

// ---------------------------------------------------------------------------
// Sales history generator
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

function pickWeighted<T>(rand: () => number, options: readonly [T, number][]): T {
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

const CHANNEL_WEIGHTS: readonly [SalesChannel, number][] = [
  ['Direct Sales', 30],
  ['Shopee', 28],
  ['TikTok Shop', 20],
  ['Shopify', 8],
  ['Retail Branch', 14],
];

const PAYMENT_WEIGHTS: readonly [PaymentMethod, number][] = [
  ['GCash', 36],
  ['Cash', 22],
  ['Bank Transfer', 18],
  ['Maya', 12],
  ['Card', 12],
];

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
  'Bea Ramirez',
  'Noel Pascual',
  'Cecilia Tan',
  'Dennis Lim',
  'Aileen Soriano',
  'Walk-in Customer',
];

function generateSales(): Sale[] {
  const rand = mulberry32(20261029);
  const itemWeights = MOCK_INVENTORY.map((item) => [item, PRODUCT_WEIGHTS[item.id].weight] as const);
  const sales: Sale[] = [];
  let counter = 1000;

  for (let offset = HISTORY_DAYS - 1; offset >= 0; offset -= 1) {
    const date = addDays(MOCK_TODAY, -offset);
    const dayOfMonth = Number(date.slice(8, 10));
    const weekday = weekdayOf(date);
    const progress = 1 - offset / HISTORY_DAYS; // business grows a little over time

    let mean = weekday === 0 || weekday === 6 ? 2.3 : 1.8;
    mean *= 1 + progress * 0.45;
    // Filipino paydays (15th and end of month) drive extra orders.
    if ([14, 15, 16, 29, 30, 31, 1].includes(dayOfMonth)) mean += 1.4;

    const orders = Math.max(0, Math.round(mean + (rand() - 0.5) * 2.6));

    for (let order = 0; order < orders; order += 1) {
      const item = pickWeighted(rand, itemWeights as unknown as readonly [InventoryItem, number][]);
      const { maxQty } = PRODUCT_WEIGHTS[item.id];
      const quantity = rand() < 0.6 ? 1 : 2 + Math.floor(rand() * (maxQty - 1));
      const channel = pickWeighted(rand, CHANNEL_WEIGHTS);
      const paymentMethod =
        channel === 'Retail Branch' && rand() < 0.5 ? 'Cash' : pickWeighted(rand, PAYMENT_WEIGHTS);
      const unitPrice = rand() < 0.1 ? Math.round(item.unitPrice * 0.9) : item.unitPrice; // occasional promo
      const customerName = CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)];

      counter += 1;
      sales.push({
        id: `S-${counter}`,
        date,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        category: item.category,
        quantity,
        unitPrice,
        unitCost: item.unitCost,
        total: roundMoney(quantity * unitPrice),
        paymentMethod,
        channel,
        customerName,
      });
    }
  }

  return sales.reverse(); // newest first
}

export const MOCK_SALES: Sale[] = generateSales();
