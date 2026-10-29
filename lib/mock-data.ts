import type { InventoryItem, Sale } from './types';

/**
 * 3 inventory entries. Stock levels are the *current* quantities,
 * i.e. already net of the 3 sample sales below.
 */
export const MOCK_INVENTORY: InventoryItem[] = [
  {
    id: 'itm-001',
    sku: 'RIC-JAS-5KG',
    name: 'Jasmine Rice 5kg',
    unitCost: 235,
    unitPrice: 290,
    stock: 48,
    reorderLevel: 15,
  },
  {
    id: 'itm-002',
    sku: 'COF-BRK-250',
    name: 'Kapeng Barako 250g',
    unitCost: 140,
    unitPrice: 195,
    stock: 9, // below reorder level -> Low Stock alert
    reorderLevel: 12,
  },
  {
    id: 'itm-003',
    sku: 'NDL-PCN-24',
    name: 'Pancit Canton Original (Box of 24)',
    unitCost: 285,
    unitPrice: 340,
    stock: 22,
    reorderLevel: 10,
  },
];

/** 3 sales entries (newest first). These feed the Accounting & Reports module. */
export const MOCK_SALES: Sale[] = [
  {
    id: 'S-1003',
    date: '2026-10-29',
    itemId: 'itm-003',
    itemName: 'Pancit Canton Original (Box of 24)',
    sku: 'NDL-PCN-24',
    quantity: 3,
    unitPrice: 340,
    unitCost: 285,
    total: 1020,
    paymentMethod: 'Bank Transfer',
    customerName: "Aling Nena's Sari-Sari Store",
  },
  {
    id: 'S-1002',
    date: '2026-10-28',
    itemId: 'itm-002',
    itemName: 'Kapeng Barako 250g',
    sku: 'COF-BRK-250',
    quantity: 6,
    unitPrice: 195,
    unitCost: 140,
    total: 1170,
    paymentMethod: 'Cash',
    customerName: 'Juan dela Cruz',
  },
  {
    id: 'S-1001',
    date: '2026-10-27',
    itemId: 'itm-001',
    itemName: 'Jasmine Rice 5kg',
    sku: 'RIC-JAS-5KG',
    quantity: 4,
    unitPrice: 290,
    unitCost: 235,
    total: 1160,
    paymentMethod: 'GCash',
    customerName: 'Maria Santos',
  },
];
