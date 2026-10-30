import { roundMoney } from './format';
import { buildDemoCosting, DEFAULT_COSTING_SETTINGS, orderCharges, type CostingState } from './costing';
import { formatPoid } from './engine';
import { addDays, weekdayOf } from './period';
import { buildWeekRemittances, closableWeeks, weekEndOf } from './remittance';
import type {
  InventoryItem,
  Merchant,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  Remittance,
  ReversalRequest,
  StockReceipt,
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
  { id: 'usr-clerk', name: 'Rey Santos', role: 'clerk' },
  { id: 'usr-m1', name: 'Liza Fernandez', role: 'merchant', merchantId: 'mrc-1' },
  { id: 'usr-m2', name: 'Bea Ramirez', role: 'merchant', merchantId: 'mrc-2' },
  { id: 'usr-m3', name: 'Carlo Navarro', role: 'merchant', merchantId: 'mrc-3' },
];

const CASHIER_ID = 'usr-cashier';
const ADMIN_ID = 'usr-admin';
const CLERK_ID = 'usr-clerk';

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
const RTS_REASONS = [
  'Customer refused the order',
  'Customer unreachable',
  'Wrong or incomplete address',
  'Customer could not pay on delivery',
];

const WALK_IN_PAYMENTS: readonly (readonly [PaymentMethod, number])[] = [
  ['Cash', 60],
  ['Bank Transfer', 15],
  ['Debit / Credit Card', 25],
];
const COD_PAYMENTS: readonly (readonly [PaymentMethod, number])[] = [
  ['Cash', 75],
  ['Bank Transfer', 15],
  ['Debit / Credit Card', 10],
];
const COP_PAYMENTS: readonly (readonly [PaymentMethod, number])[] = [
  ['Cash', 65],
  ['Bank Transfer', 15],
  ['Debit / Credit Card', 20],
];

const two = (value: number): string => String(value).padStart(2, '0');
const stamp = (date: string, hour: number, minute: number): string =>
  `${date}T${two(Math.min(hour, 21))}:${two(minute)}`;

/**
 * DEMO costing. The pickup prices are only the suggested prices from the formula, so the screen
 * has something to show. The admin must set the real pickup prices.
 */
export const MOCK_COSTING: CostingState = {
  settings: { ...DEFAULT_COSTING_SETTINGS },
  rows: buildDemoCosting(MOCK_INVENTORY),
  log: [],
};

function generateOrders(): Order[] {
  const rand = mulberry32(20261029);
  const orders: Order[] = [];
  const reserved = new Map<string, number>();
  let counter = 0;
  let waybillCounter = 100000000;

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

        // COD goes out with a courier before it is paid: some recent ones are still on the road,
        // and older refused ones come back as RTS.
        if (terms === 'COD' && !walkIn) {
          if (status === 'delivered' && offset === 0 && rand() < 0.5) status = 'shipped';
          else if (status === 'delivered' && offset === 1 && rand() < 0.15) status = 'shipped';
          else if (status === 'cancelled' && offset >= 1 && rand() < 0.7) status = 'rts';
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
          id: formatPoid(counter),
          merchantId: merchant.id,
          source: walkIn ? 'walk-in' : 'merchant',
          createdBy: walkIn ? CASHIER_ID : merchantUser.id,
          createdAt,
          customerName: walkIn
            ? rand() < 0.15
              ? CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)]
              : 'Walk-in client'
            : CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)],
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
        {
          const charges = orderCharges(
            lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity })),
            MOCK_COSTING,
          );
          if (charges) {
            order.pickupHkd = charges.pickupHkd;
            if (terms === 'COD' && !walkIn) {
              order.sfHkd = charges.sfHkd;
              order.collectionFeeHkd = charges.cfHkd;
              order.netCodHkd = charges.netCodHkd;
              order.amountHkd = charges.netCodHkd;
            } else {
              order.amountHkd = charges.pickupHkd;
            }
          }
        }
        if (terms === 'COD' && !walkIn && (status === 'shipped' || status === 'rts' || status === 'delivered')) {
          waybillCounter += 1;
          order.waybill = `WB-${waybillCounter}`;
          order.shippedAt = stamp(date, hour + 1, Math.min(59, minute + 10));
        }
        if (status === 'rts') {
          order.rtsAt = stamp(addDays(date, 1 + Math.floor(rand() * 2)), 10 + Math.floor(rand() * 6), Math.floor(rand() * 60));
          order.rtsReason = RTS_REASONS[Math.floor(rand() * RTS_REASONS.length)];
        }
        if (status === 'delivered') {
          const nextDay = !walkIn && offset >= 1 && terms === 'COD' && rand() < 0.25;
          order.deliveredAt = walkIn
            ? createdAt
            : nextDay
              ? stamp(addDays(date, 1), 9 + Math.floor(rand() * 8), Math.floor(rand() * 60))
              : stamp(date, hour + (terms === 'COD' && !walkIn ? 2 : 1) + Math.floor(rand() * 3), Math.floor(rand() * 60));
          order.paymentMethod = pickWeighted(
            rand,
            walkIn ? WALK_IN_PAYMENTS : terms === 'COD' ? COD_PAYMENTS : COP_PAYMENTS,
          );
          order.topUpRate = MOCK_COSTING.settings.markupPct;
        }
        if (status === 'cancelled') {
          order.cancelledAt = stamp(date, hour + 2, minute);
          order.cancelReason = CANCEL_REASONS[Math.floor(rand() * CANCEL_REASONS.length)];
        }
        orders.push(order);
      }
    }
  }

  // Make sure a few parcels are on the road right now, so the Shipped view has something in it.
  orders
    .filter(
      (order) =>
        order.status === 'delivered' &&
        order.source === 'merchant' &&
        order.terms === 'COD' &&
        order.createdAt.slice(0, 10) >= addDays(MOCK_TODAY, -1),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .forEach((order) => {
      order.status = 'shipped';
      delete order.deliveredAt;
      delete order.paymentMethod;
      delete order.topUpRate;
    });

  return orders.sort((a, b) =>
    a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
  );
}

export const MOCK_ORDERS: Order[] = generateOrders();

/** Highest POID handed out so far. New orders continue from here. */
export const MOCK_PO_SEQ: number = MOCK_ORDERS.length;

/**
 * Receiving history. Approved receipts are already reflected in the stock levels above.
 * The newest RTS order is still waiting to be received back, the one before it waits for approval,
 * and one new stock delivery is waiting for approval, so every step can be tried in the demo.
 */
function generateReceipts(): StockReceipt[] {
  const receipts: StockReceipt[] = [];
  const add = (receipt: Omit<StockReceipt, 'id'>) =>
    receipts.push({ ...receipt, id: `RCV-${String(receipts.length + 1).padStart(6, '0')}` });
  const lineOf = (itemId: string, quantity: number) => {
    const item = MOCK_INVENTORY.find((candidate) => candidate.id === itemId)!;
    return { itemId, sku: item.sku, name: item.name, quantity };
  };

  // Past stock deliveries, oldest first.
  const history: [string, string, number, number][] = [
    ['mrc-1', 'itm-001', 60, 62],
    ['mrc-3', 'itm-006', 80, 58],
    ['mrc-2', 'itm-008', 40, 50],
    ['mrc-1', 'itm-003', 60, 41],
    ['mrc-3', 'itm-005', 50, 33],
    ['mrc-2', 'itm-009', 30, 20],
    ['mrc-1', 'itm-002', 40, 12],
  ];
  for (const [merchantId, itemId, quantity, daysAgo] of history) {
    const day = addDays(MOCK_TODAY, -daysAgo);
    add({
      kind: 'stock-in',
      merchantId,
      receivedDate: day,
      lines: [lineOf(itemId, quantity)],
      note: 'Delivered by merchant',
      receivedBy: CASHIER_ID,
      createdAt: `${day}T10:15`,
      status: 'approved',
      decidedBy: daysAgo % 2 === 0 ? CLERK_ID : ADMIN_ID,
      decidedAt: `${day}T14:00`,
    });
  }

  // RTS orders, oldest first. The newest is not received yet, the one before is pending approval.
  const rtsOrders = MOCK_ORDERS.filter((order) => order.status === 'rts').sort((a, b) =>
    (a.rtsAt ?? '').localeCompare(b.rtsAt ?? ''),
  );
  rtsOrders.forEach((order, index) => {
    const fromNewest = rtsOrders.length - 1 - index;
    if (fromNewest === 0) return;
    const day = (order.rtsAt ?? '').slice(0, 10) || MOCK_TODAY;
    const received = day < MOCK_TODAY ? addDays(day, 1) : day;
    const pending = fromNewest === 1;
    const receiptId = `RCV-${String(receipts.length + 1).padStart(6, '0')}`;
    order.returnReceiptId = receiptId;
    add({
      kind: 'rts',
      merchantId: order.merchantId,
      orderId: order.id,
      receivedDate: received > MOCK_TODAY ? MOCK_TODAY : received,
      lines: order.lines.map((line) => lineOf(line.itemId, line.quantity)),
      note: '',
      receivedBy: CASHIER_ID,
      createdAt: `${received > MOCK_TODAY ? MOCK_TODAY : received}T11:30`,
      status: pending ? 'pending' : 'approved',
      ...(pending ? {} : { decidedBy: ADMIN_ID, decidedAt: `${received > MOCK_TODAY ? MOCK_TODAY : received}T15:00` }),
    });
  });

  // A fresh delivery from Everyday Health PH waiting for approval.
  add({
    kind: 'stock-in',
    merchantId: 'mrc-3',
    receivedDate: MOCK_TODAY,
    lines: [lineOf('itm-007', 60)],
    note: 'Vitamin D3 restock',
    receivedBy: CASHIER_ID,
    createdAt: `${MOCK_TODAY}T09:20`,
    status: 'pending',
  });

  return receipts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const MOCK_RECEIPTS: StockReceipt[] = generateReceipts();

/**
 * DEMO remittances: every finished week is closed. All are released except the latest finished week,
 * which is still waiting for release. The SF deduction is a demo figure (PHP 45 per delivered COD
 * order). In real use the admin types the actual SF advanced from PH to HK.
 */
function generateRemittances(): Remittance[] {
  const weeks = closableWeeks(MOCK_ORDERS, [], MOCK_TODAY);
  const all: Remittance[] = [];
  weeks.forEach((weekStart, index) => {
    const created = buildWeekRemittances(MOCK_ORDERS, weekStart, all.length + 1, ADMIN_ID, `${addDays(weekEndOf(weekStart), 1)}T09:00`);
    const latest = index === weeks.length - 1;
    for (const remittance of created) {
      if (latest) {
        all.push(remittance);
        continue;
      }
      const cod = remittance.orderIds.filter((id) => {
        const order = MOCK_ORDERS.find((candidate) => candidate.id === id)!;
        return order.terms === 'COD' && order.source === 'merchant';
      }).length;
      const deduction = Math.min(remittance.netPayable, cod * 45);
      all.push({
        ...remittance,
        deductionPhp: deduction,
        deductionNote: deduction > 0 ? `Actual SF PH to HK advanced, ${cod} COD order${cod === 1 ? '' : 's'} (demo)` : '',
        payoutPhp: roundMoney(remittance.netPayable - deduction),
        status: 'released',
        releasedBy: ADMIN_ID,
        releasedDate: addDays(weekEndOf(weekStart), 2),
        reference: `BANK-${remittance.id.slice(4)}`,
      });
    }
  });
  // Newest first, merchants in order.
  return all.reverse();
}

export const MOCK_REMITTANCES: Remittance[] = generateRemittances();

/** DEMO reversal requests: one waiting, one rejected, on recent deliveries that are not locked yet. */
function generateReversals(): ReversalRequest[] {
  const locked = new Set(MOCK_REMITTANCES.flatMap((remittance) => remittance.orderIds));
  const open = MOCK_ORDERS.filter((order) => order.status === 'delivered' && order.source === 'merchant' && !locked.has(order.id))
    .sort((a, b) => (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''));
  const out: ReversalRequest[] = [];
  if (open[0]) {
    out.push({
      id: 'REV-000002',
      orderId: open[0].id,
      merchantId: open[0].merchantId,
      requestedBy: CASHIER_ID,
      requestedAt: `${open[0].deliveredAt!.slice(0, 10)}T${open[0].deliveredAt!.slice(11, 13)}:59`,
      note: 'Clicked delivered by mistake, the customer has not paid yet.',
      status: 'pending',
    });
  }
  if (open[1]) {
    out.push({
      id: 'REV-000001',
      orderId: open[1].id,
      merchantId: open[1].merchantId,
      requestedBy: CASHIER_ID,
      requestedAt: `${open[1].deliveredAt!.slice(0, 10)}T${open[1].deliveredAt!.slice(11, 13)}:58`,
      note: 'Wrong payment method.',
      status: 'rejected',
      decidedBy: CLERK_ID,
      decidedAt: `${open[1].deliveredAt!.slice(0, 10)}T${open[1].deliveredAt!.slice(11, 13)}:59`,
      decisionNote: 'Payment method can be seen in the ledger. No need to undo.',
    });
  }
  return out;
}

export const MOCK_REVERSALS: ReversalRequest[] = generateReversals();
