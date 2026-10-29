'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { roundMoney } from './format';
import { MOCK_INVENTORY, MOCK_SALES } from './mock-data';
import type { InventoryItem, Sale, SaleInput } from './types';

interface State {
  items: InventoryItem[];
  sales: Sale[];
}

export type AddSaleResult = { ok: true; sale: Sale } | { ok: false; error: string };

interface MerchantContextValue {
  items: InventoryItem[];
  sales: Sale[];
  hydrated: boolean;
  /** Records a sale and deducts the sold quantity from inventory in one step. */
  addSale: (input: SaleInput) => AddSaleResult;
  restock: (itemId: string, quantity: number) => void;
  resetDemo: () => void;
}

const STORAGE_KEY = 'merchant-app:v1';

const createInitialState = (): State => ({
  items: MOCK_INVENTORY.map((item) => ({ ...item })),
  sales: MOCK_SALES.map((sale) => ({ ...sale })),
});

const MerchantContext = createContext<MerchantContextValue | null>(null);

export function MerchantProvider({ children }: { children: ReactNode }) {
  // Start from mock data so server and client render identically,
  // then swap in any saved data after mount.
  const [state, setState] = useState<State>(createInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        if (Array.isArray(parsed.items) && Array.isArray(parsed.sales)) {
          setState(parsed);
        }
      }
    } catch {
      // Ignore corrupt or unavailable storage and keep the demo data.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be full or blocked; the app still works in memory.
    }
  }, [state, hydrated]);

  const addSale = useCallback(
    (input: SaleInput): AddSaleResult => {
      const item = state.items.find((candidate) => candidate.id === input.itemId);
      if (!item) return { ok: false, error: 'That item no longer exists.' };
      if (input.quantity > item.stock) {
        return { ok: false, error: `Only ${item.stock} of "${item.name}" left in stock.` };
      }

      const lastNumber = state.sales.reduce(
        (max, sale) => Math.max(max, Number(sale.id.replace(/\D/g, '')) || 0),
        1000,
      );
      const sale: Sale = {
        id: `S-${lastNumber + 1}`,
        date: input.date,
        itemId: item.id,
        itemName: item.name,
        sku: item.sku,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        unitCost: item.unitCost,
        total: roundMoney(input.quantity * input.unitPrice),
        paymentMethod: input.paymentMethod,
        customerName: input.customerName.trim(),
      };

      setState((prev) => ({
        items: prev.items.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, stock: candidate.stock - input.quantity }
            : candidate,
        ),
        sales: [sale, ...prev.sales],
      }));

      return { ok: true, sale };
    },
    [state],
  );

  const restock = useCallback((itemId: string, quantity: number) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId ? { ...item, stock: item.stock + quantity } : item,
      ),
    }));
  }, []);

  const resetDemo = useCallback(() => setState(createInitialState()), []);

  const value = useMemo<MerchantContextValue>(
    () => ({
      items: state.items,
      sales: state.sales,
      hydrated,
      addSale,
      restock,
      resetDemo,
    }),
    [state, hydrated, addSale, restock, resetDemo],
  );

  return <MerchantContext.Provider value={value}>{children}</MerchantContext.Provider>;
}

export function useMerchant(): MerchantContextValue {
  const context = useContext(MerchantContext);
  if (!context) throw new Error('useMerchant must be used inside <MerchantProvider>.');
  return context;
}
