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
import type { Actor, AppState, PlaceOrderInput, ResellerOrderInput, ResellerApplication } from './engine';
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
  MOCK_PACKAGE_SALES,
} from './mock-data';
import type { CostingRow, CostingSettings, CostingState } from './costing';
import type {
  InventoryItem,
  Remittance,
  ReversalRequest,
  Merchant,
  Order,
  PaymentMethod,
  BranchId,
  PackageSale,
  SentEmail,
  StockReceipt,
  User,
} from './types';

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface TeamTools {
  addMerchant: (input: { name: string }) => Promise<ActionResult<Merchant>>;
  addUser: (input: { name: string; role: string; email: string; branchId?: string; merchantId?: string }) => Promise<ActionResult<User>>;
  resendInvite: (userId: string) => Promise<ActionResult<boolean>>;
}

export interface AppDataValue {
  merchants: Merchant[];
  users: User[];
  items: InventoryItem[];
  orders: Order[];
  receipts: StockReceipt[];
  reversals: ReversalRequest[];
  remittances: Remittance[];
  packageSales: PackageSale[];
  outbox: SentEmail[];
  applyForReseller: (input: ResellerApplication) => Promise<ActionResult<Order>>;
  changeCredentials: (userId: string, username: string, password: string) => Promise<ActionResult<User>>;
  /** Costing table, settings and change log. Show it only to the admin. */
  costing: CostingState;
  hydrated: boolean;
  placeOrder: (actor: Actor, input: PlaceOrderInput) => Promise<ActionResult<Order>>;
  placeResellerOrder: (actor: Actor, input: ResellerOrderInput) => Promise<ActionResult<Order[]>>;
  checkoutWalkIn: (
    actor: Actor,
    input: {
      lines: { itemId: string; quantity: number }[];
      paymentMethod: PaymentMethod;
      customerName?: string;
      branch?: BranchId;
      resellerId?: string;
      newReseller?: { name: string; email?: string; sponsorId?: string };
    },
  ) => Promise<ActionResult<Order[]>>;
  markPacked: (actor: Actor, orderId: string) => Promise<ActionResult<Order>>;
  shipOrder: (actor: Actor, orderId: string, waybill: string) => Promise<ActionResult<Order>>;
  markDelivered: (actor: Actor, orderId: string, paymentMethod: PaymentMethod) => Promise<ActionResult<Order>>;
  markRts: (actor: Actor, orderId: string, reason: string) => Promise<ActionResult<Order>>;
  cancelOrder: (actor: Actor, orderId: string, reason: string) => Promise<ActionResult<Order>>;
  receiveStock: (
    actor: Actor,
    input: {
      kind?: 'stock-in' | 'stock-out';
      merchantId: string;
      receivedDate: string;
      note: string;
      lines: { itemId: string; quantity: number }[];
      branch?: BranchId;
    },
  ) => Promise<ActionResult<StockReceipt>>;
  receiveReturn: (
    actor: Actor,
    input: { orderId: string; receivedDate: string; note: string },
  ) => Promise<ActionResult<StockReceipt>>;
  approveReceipt: (actor: Actor, receiptId: string) => Promise<ActionResult<StockReceipt>>;
  rejectReceipt: (actor: Actor, receiptId: string, reason: string) => Promise<ActionResult<StockReceipt>>;
  setPickupPrices: (
    actor: Actor,
    changes: { rowId: string; pickupPriceHkd: number }[],
  ) => Promise<ActionResult<number>>;
  setCostingSettings: (actor: Actor, patch: Partial<CostingSettings>) => Promise<ActionResult<CostingSettings>>;
  removeCostingRow: (actor: Actor, rowId: string) => Promise<ActionResult<CostingRow>>;
  requestReversal: (actor: Actor, orderId: string, note: string) => Promise<ActionResult<ReversalRequest>>;
  approveReversal: (actor: Actor, requestId: string) => Promise<ActionResult<ReversalRequest>>;
  rejectReversal: (actor: Actor, requestId: string, reason: string) => Promise<ActionResult<ReversalRequest>>;
  closeWeek: (actor: Actor, weekStart: string) => Promise<ActionResult<Remittance[]>>;
  approveRelease: (actor: Actor, remittanceId: string) => Promise<ActionResult<Remittance>>;
  rejectRelease: (actor: Actor, remittanceId: string, reason: string) => Promise<ActionResult<Remittance>>;
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
  ) => Promise<ActionResult<Remittance>>;
  approveCostingRow: (actor: Actor, rowId: string) => Promise<ActionResult<CostingRow>>;
  revokeApproval: (actor: Actor, rowId: string) => Promise<ActionResult<CostingRow>>;
  goLiveCostingRow: (actor: Actor, rowId: string) => Promise<ActionResult<CostingRow>>;
  setSkuDisabled: (actor: Actor, itemId: string, disabled: boolean) => Promise<ActionResult<InventoryItem>>;
  setProgramMerchant: (actor: Actor, merchantId: string, on: boolean) => Promise<ActionResult<string[]>>;
  setSkuReseller: (actor: Actor, itemId: string, inProgram: boolean) => Promise<ActionResult<InventoryItem>>;
  addSku: (actor: Actor, input: engine.NewSkuInput) => Promise<ActionResult<InventoryItem>>;
  resetDemo: () => void;
  /** Account management. Live mode only (null in the demo). */
  team: TeamTools | null;
  /** True when the data lives on the server (real sign-in). False = demo data saved in this browser. */
  remote: boolean;
}

// Bumped whenever the saved data shape changes.
const STORAGE_KEY = 'sdsi-wellness:v17';

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
    programMerchantIds: [...MOCK_COSTING.programMerchantIds],
  },
  users: MOCK_USERS.map((user) => ({ ...user })),
  outbox: [],
  packageSales: MOCK_PACKAGE_SALES.map((sale) => ({ ...sale, tiers: sale.tiers.map((tier) => ({ ...tier })) })),
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
    Array.isArray(candidate.packageSales) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.outbox) &&
    !!candidate.costing &&
    Array.isArray(candidate.costing.rows) &&
    typeof candidate.poSeq === 'number'
  );
};

export const AppDataContext = createContext<AppDataValue | null>(null);

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
    <T,>(action: (current: AppState) => engine.Outcome<T>): Promise<ActionResult<T>> => {
      const outcome = action(stateRef.current);
      if (!outcome.ok) return Promise.resolve({ ok: false, error: outcome.error });
      commit(outcome.state);
      return Promise.resolve({ ok: true, value: outcome.value });
    },
    [commit],
  );

  const value = useMemo<AppDataValue>(
    () => ({
      merchants: MOCK_MERCHANTS,
      users: state.users,
      items: state.items,
      orders: state.orders,
      receipts: state.receipts,
      reversals: state.reversals,
      remittances: state.remittances,
      packageSales: state.packageSales,
      outbox: state.outbox,
      applyForReseller: (input) => run((s) => engine.applyForReseller(s, input, nowISO())),
      changeCredentials: (userId, username, password) => run((s) => engine.changeCredentials(s, userId, username, password)),
      costing: state.costing,
      hydrated,
      placeOrder: (actor, input) => run((s) => engine.placeMerchantOrder(s, actor, input, nowISO())),
      placeResellerOrder: (actor, input) => run((s) => engine.placeResellerOrder(s, actor, input, nowISO())),
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
      setProgramMerchant: (actor, merchantId, on) =>
        run((s) => engine.setProgramMerchant(s, actor, merchantId, on, nowISO())),
      setSkuReseller: (actor, itemId, inProgram) =>
        run((s) => engine.setSkuReseller(s, actor, itemId, inProgram, nowISO())),
      setSkuDisabled: (actor, itemId, disabled) =>
        run((s) => engine.setSkuDisabled(s, actor, itemId, disabled, nowISO())),
      addSku: (actor, input) => run((s) => engine.addSku(s, actor, input, nowISO())),
      resetDemo: () => commit(createInitialState()),
      remote: false,
      team: null,
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
