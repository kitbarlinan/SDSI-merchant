'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_TOP_UP_PERCENT } from './brand';
import * as engine from './engine';
import type { Actor, AppState, PlaceOrderInput } from './engine';
import { nowISO } from './format';
import { MOCK_INVENTORY, MOCK_MERCHANTS, MOCK_ORDERS, MOCK_USERS } from './mock-data';
import type { InventoryItem, Merchant, Order, PaymentMethod, User } from './types';

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface AppDataValue {
  merchants: Merchant[];
  users: User[];
  items: InventoryItem[];
  orders: Order[];
  /** Current SDSI top-up percent (placeholder until the real rate is agreed). */
  topUpPercent: number;
  hydrated: boolean;
  placeOrder: (actor: Actor, input: PlaceOrderInput) => ActionResult<Order>;
  checkoutWalkIn: (
    actor: Actor,
    input: { lines: { itemId: string; quantity: number }[]; paymentMethod: PaymentMethod },
  ) => ActionResult<Order[]>;
  markPacked: (actor: Actor, orderId: string) => ActionResult<Order>;
  markDelivered: (actor: Actor, orderId: string, paymentMethod: PaymentMethod) => ActionResult<Order>;
  cancelOrder: (actor: Actor, orderId: string, reason: string) => ActionResult<Order>;
  receiveStock: (actor: Actor, itemId: string, quantity: number) => ActionResult<InventoryItem>;
  setTopUpPercent: (actor: Actor, percent: number) => ActionResult<number>;
  resetDemo: () => void;
}

// Bumped whenever the saved data shape changes.
const STORAGE_KEY = 'sdsi-wellness:v3';

const createInitialState = (): AppState => ({
  items: MOCK_INVENTORY.map((item) => ({ ...item })),
  orders: MOCK_ORDERS.map((order) => ({ ...order, lines: order.lines.map((line) => ({ ...line })) })),
  topUpPercent: DEFAULT_TOP_UP_PERCENT,
});

const isSavedState = (value: unknown): value is AppState => {
  const candidate = value as Partial<AppState> | null;
  return (
    !!candidate &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.orders) &&
    typeof candidate.topUpPercent === 'number'
  );
};

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  // Start from mock data so server and client render identically,
  // then swap in any saved data after mount.
  const [state, setState] = useState<AppState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);
  // Always holds the latest state so two actions in the same tick never overwrite each other.
  const stateRef = useRef<AppState>(state);

  const commit = useCallback((next: AppState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isSavedState(parsed)) commit(parsed);
      }
    } catch {
      // Ignore corrupt or unavailable storage and keep the demo data.
    }
    setHydrated(true);
  }, [commit]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage may be full or blocked; the app still works in memory.
    }
  }, [state, hydrated]);

  const run = useCallback(
    <T,>(action: (current: AppState) => engine.Outcome<T>): ActionResult<T> => {
      const outcome = action(stateRef.current);
      if (!outcome.ok) return { ok: false, error: outcome.error };
      commit(outcome.state);
      return { ok: true, value: outcome.value };
    },
    [commit],
  );

  const value = useMemo<AppDataValue>(
    () => ({
      merchants: MOCK_MERCHANTS,
      users: MOCK_USERS,
      items: state.items,
      orders: state.orders,
      topUpPercent: state.topUpPercent,
      hydrated,
      placeOrder: (actor, input) => run((s) => engine.placeMerchantOrder(s, actor, input, nowISO())),
      checkoutWalkIn: (actor, input) => run((s) => engine.checkoutWalkIn(s, actor, input, nowISO())),
      markPacked: (actor, orderId) => run((s) => engine.markPacked(s, actor, orderId, nowISO())),
      markDelivered: (actor, orderId, paymentMethod) =>
        run((s) => engine.markDelivered(s, actor, orderId, paymentMethod, nowISO())),
      cancelOrder: (actor, orderId, reason) =>
        run((s) => engine.cancelOrder(s, actor, orderId, reason, nowISO())),
      receiveStock: (actor, itemId, quantity) =>
        run((s) => engine.receiveStock(s, actor, itemId, quantity)),
      setTopUpPercent: (actor, percent) => run((s) => engine.setTopUpPercent(s, actor, percent)),
      resetDemo: () => commit(createInitialState()),
    }),
    [state, hydrated, run, commit],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used inside <AppDataProvider>.');
  return context;
}
