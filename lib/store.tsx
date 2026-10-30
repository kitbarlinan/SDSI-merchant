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
import * as engine from './engine';
import type { Actor, AppState, PlaceOrderInput } from './engine';
import { nowISO } from './format';
import {
  MOCK_COSTING,
  MOCK_REMITTANCES,
  MOCK_REVERSALS,
  MOCK_INVENTORY,
  MOCK_MERCHANTS,
  MOCK_ORDERS,
  MOCK_PO_SEQ,
  MOCK_RECEIPTS,
  MOCK_USERS,
} from './mock-data';
import type { CostingRow, CostingSettings, CostingState } from './costing';
import type {
  InventoryItem,
  Remittance,
  ReversalRequest,
  Merchant,
  Order,
  PaymentMethod,
  StockReceipt,
  User,
} from './types';

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface AppDataValue {
  merchants: Merchant[];
  users: User[];
  items: InventoryItem[];
  orders: Order[];
  receipts: StockReceipt[];
  reversals: ReversalRequest[];
  remittances: Remittance[];
  /** Costing table, settings and change log. Show it only to the admin. */
  costing: CostingState;
  hydrated: boolean;
  placeOrder: (actor: Actor, input: PlaceOrderInput) => ActionResult<Order>;
  checkoutWalkIn: (
    actor: Actor,
    input: {
      lines: { itemId: string; quantity: number }[];
      paymentMethod: PaymentMethod;
      customerName?: string;
    },
  ) => ActionResult<Order[]>;
  markPacked: (actor: Actor, orderId: string) => ActionResult<Order>;
  shipOrder: (actor: Actor, orderId: string, waybill: string) => ActionResult<Order>;
  markDelivered: (actor: Actor, orderId: string, paymentMethod: PaymentMethod) => ActionResult<Order>;
  markRts: (actor: Actor, orderId: string, reason: string) => ActionResult<Order>;
  cancelOrder: (actor: Actor, orderId: string, reason: string) => ActionResult<Order>;
  receiveStock: (
    actor: Actor,
    input: {
      kind?: 'stock-in' | 'stock-out';
      merchantId: string;
      receivedDate: string;
      note: string;
      lines: { itemId: string; quantity: number }[];
    },
  ) => ActionResult<StockReceipt>;
  receiveReturn: (
    actor: Actor,
    input: { orderId: string; receivedDate: string; note: string },
  ) => ActionResult<StockReceipt>;
  approveReceipt: (actor: Actor, receiptId: string) => ActionResult<StockReceipt>;
  rejectReceipt: (actor: Actor, receiptId: string, reason: string) => ActionResult<StockReceipt>;
  setPickupPrices: (
    actor: Actor,
    changes: { rowId: string; pickupPriceHkd: number }[],
  ) => ActionResult<number>;
  setCostingSettings: (actor: Actor, patch: Partial<CostingSettings>) => ActionResult<CostingSettings>;
  removeCostingRow: (actor: Actor, rowId: string) => ActionResult<CostingRow>;
  requestReversal: (actor: Actor, orderId: string, note: string) => ActionResult<ReversalRequest>;
  approveReversal: (actor: Actor, requestId: string) => ActionResult<ReversalRequest>;
  rejectReversal: (actor: Actor, requestId: string, reason: string) => ActionResult<ReversalRequest>;
  closeWeek: (actor: Actor, weekStart: string) => ActionResult<Remittance[]>;
  approveRelease: (actor: Actor, remittanceId: string) => ActionResult<Remittance>;
  rejectRelease: (actor: Actor, remittanceId: string, reason: string) => ActionResult<Remittance>;
  submitRelease: (
    actor: Actor,
    remittanceId: string,
    input: {
      releasedDate: string;
      deductionPhp: number;
      deductionNote: string;
      adjustmentPhp?: number;
      adjustmentNote?: string;
      reference: string;
    },
  ) => ActionResult<Remittance>;
  approveCostingRow: (actor: Actor, rowId: string) => ActionResult<CostingRow>;
  revokeApproval: (actor: Actor, rowId: string) => ActionResult<CostingRow>;
  goLiveCostingRow: (actor: Actor, rowId: string) => ActionResult<CostingRow>;
  setSkuDisabled: (actor: Actor, itemId: string, disabled: boolean) => ActionResult<InventoryItem>;
  addSku: (actor: Actor, input: engine.NewSkuInput) => ActionResult<InventoryItem>;
  resetDemo: () => void;
}

// Bumped whenever the saved data shape changes.
const STORAGE_KEY = 'sdsi-wellness:v11';

const createInitialState = (): AppState => ({
  items: MOCK_INVENTORY.map((item) => ({ ...item })),
  orders: MOCK_ORDERS.map((order) => ({ ...order, lines: order.lines.map((line) => ({ ...line })) })),
  receipts: MOCK_RECEIPTS.map((receipt) => ({ ...receipt, lines: receipt.lines.map((line) => ({ ...line })) })),
  reversals: MOCK_REVERSALS.map((request) => ({ ...request })),
  remittances: MOCK_REMITTANCES.map((remittance) => ({ ...remittance, orderIds: [...remittance.orderIds] })),
  costing: {
    settings: { ...MOCK_COSTING.settings },
    rows: MOCK_COSTING.rows.map((row) => ({ ...row })),
    log: [],
  },
  poSeq: MOCK_PO_SEQ,
});

const isSavedState = (value: unknown): value is AppState => {
  const candidate = value as Partial<AppState> | null;
  return (
    !!candidate &&
    Array.isArray(candidate.items) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.receipts) &&
    Array.isArray(candidate.reversals) &&
    Array.isArray(candidate.remittances) &&
    !!candidate.costing &&
    Array.isArray(candidate.costing.rows) &&
    typeof candidate.poSeq === 'number'
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
      receipts: state.receipts,
      reversals: state.reversals,
      remittances: state.remittances,
      costing: state.costing,
      hydrated,
      placeOrder: (actor, input) => run((s) => engine.placeMerchantOrder(s, actor, input, nowISO())),
      checkoutWalkIn: (actor, input) => run((s) => engine.checkoutWalkIn(s, actor, input, nowISO())),
      markPacked: (actor, orderId) => run((s) => engine.markPacked(s, actor, orderId, nowISO())),
      shipOrder: (actor, orderId, waybill) =>
        run((s) => engine.shipOrder(s, actor, orderId, waybill, nowISO())),
      markRts: (actor, orderId, reason) =>
        run((s) => engine.markRts(s, actor, orderId, reason, nowISO())),
      markDelivered: (actor, orderId, paymentMethod) =>
        run((s) => engine.markDelivered(s, actor, orderId, paymentMethod, nowISO())),
      cancelOrder: (actor, orderId, reason) =>
        run((s) => engine.cancelOrder(s, actor, orderId, reason, nowISO())),
      receiveStock: (actor, input) =>
        run((s) => engine.createStockInReceipt(s, actor, input, nowISO())),
      receiveReturn: (actor, input) =>
        run((s) => engine.createReturnReceipt(s, actor, input, nowISO())),
      approveReceipt: (actor, receiptId) =>
        run((s) => engine.approveReceipt(s, actor, receiptId, nowISO())),
      rejectReceipt: (actor, receiptId, reason) =>
        run((s) => engine.rejectReceipt(s, actor, receiptId, reason, nowISO())),
      setPickupPrices: (actor, changes) =>
        run((s) => engine.setPickupPrices(s, actor, changes, nowISO())),
      setCostingSettings: (actor, patch) =>
        run((s) => engine.setCostingSettings(s, actor, patch, nowISO())),
      removeCostingRow: (actor, rowId) => run((s) => engine.removeCostingRow(s, actor, rowId, nowISO())),
      requestReversal: (actor, orderId, note) => run((s) => engine.requestReversal(s, actor, orderId, note, nowISO())),
      approveReversal: (actor, requestId) => run((s) => engine.approveReversal(s, actor, requestId, nowISO())),
      rejectReversal: (actor, requestId, reason) =>
        run((s) => engine.rejectReversal(s, actor, requestId, reason, nowISO())),
      closeWeek: (actor, weekStart) => run((s) => engine.closeWeek(s, actor, weekStart, nowISO())),
      submitRelease: (actor, remittanceId, input) =>
        run((s) => engine.submitRelease(s, actor, remittanceId, input, nowISO())),
      approveRelease: (actor, remittanceId) => run((s) => engine.approveRelease(s, actor, remittanceId, nowISO())),
      rejectRelease: (actor, remittanceId, reason) =>
        run((s) => engine.rejectRelease(s, actor, remittanceId, reason, nowISO())),
      approveCostingRow: (actor, rowId) => run((s) => engine.approveCostingRow(s, actor, rowId, nowISO())),
      revokeApproval: (actor, rowId) => run((s) => engine.revokeApproval(s, actor, rowId, nowISO())),
      goLiveCostingRow: (actor, rowId) => run((s) => engine.goLiveCostingRow(s, actor, rowId, nowISO())),
      setSkuDisabled: (actor, itemId, disabled) =>
        run((s) => engine.setSkuDisabled(s, actor, itemId, disabled, nowISO())),
      addSku: (actor, input) => run((s) => engine.addSku(s, actor, input, nowISO())),
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
