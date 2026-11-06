'use client';

import { isViewOnly, VIEW_ONLY_MESSAGE } from './view-only';
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
  MOCK_PRODUCTS,
  MOCK_MERCHANTS,
  MOCK_ORDERS,
  MOCK_PO_SEQ,
  MOCK_RECEIPTS,
  MOCK_USERS,
  MOCK_PACKAGE_SALES,
} from './mock-data';
import type { CostingRow, CostingSettings, CostingState, ReferralLink } from './costing';
import type {
  InventoryItem,
  MasterProduct,
  Remittance,
  ReversalRequest,
  Merchant,
  Order,
  PaymentMethod,
  BranchId,
  PackageSale,
  EarningPayout,
  SentEmail,
  StockReceipt,
  User,
} from './types';
import { normalizeCategory } from './types';
import { normalizeProduct } from './stock';

/** `warnings`: the action worked but something around it did not (e.g. an invitation email could not be sent). */
export type ActionResult<T> = { ok: true; value: T; warnings?: string[] } | { ok: false; error: string };

/** Name plus the optional owner and bank details. */
export interface MerchantInput {
  name: string;
  ownerName?: string;
  bankName?: string;
  bankAccountName?: string;
  bankAccountNo?: string;
}

export interface TeamTools {
  addMerchant: (input: MerchantInput) => Promise<ActionResult<Merchant>>;
  updateMerchant: (input: MerchantInput & { id: string }) => Promise<ActionResult<Merchant>>;
  deleteMerchant: (id: string) => Promise<ActionResult<boolean>>;
  addUser: (input: { name: string; role: string; email: string; branchId?: string; merchantId?: string }) => Promise<ActionResult<User>>;
  resendInvite: (userId: string) => Promise<ActionResult<boolean>>;
  deleteUser: (userId: string) => Promise<ActionResult<boolean>>;
  /** An invitation link made without any email, to send by hand. */
  inviteLink: (userId: string) => Promise<ActionResult<string>>;
}

export interface AppDataValue {
  merchants: Merchant[];
  users: User[];
  items: InventoryItem[];
  /** Inventory master list. */
  products: MasterProduct[];
  orders: Order[];
  receipts: StockReceipt[];
  reversals: ReversalRequest[];
  remittances: Remittance[];
  packageSales: PackageSale[];
  earningPayouts: EarningPayout[];
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
      lines: { productId?: string; itemId?: string; quantity: number }[];
      branch?: BranchId;
    },
  ) => Promise<ActionResult<StockReceipt>>;
  transferStock: (
    actor: Actor,
    input: { merchantId: string; from: BranchId; to: BranchId; receivedDate: string; note: string; lines: { productId?: string; itemId?: string; quantity: number }[] },
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
  requestEarningPayout: (actor: Actor, amountHkd: number) => Promise<ActionResult<EarningPayout>>;
  markEarningPaid: (actor: Actor, payoutId: string, reference: string) => Promise<ActionResult<EarningPayout>>;
  cancelEarningPayout: (actor: Actor, payoutId: string) => Promise<ActionResult<EarningPayout>>;
  setReferralLinks: (actor: Actor, input: { rootSponsorId: string | null; linkHolderIds: string[] }) => Promise<ActionResult<{ rootSponsorId?: string; linkHolderIds: string[] }>>;
  setMerchantReferrer: (actor: Actor, merchantId: string, userId: string | null) => Promise<ActionResult<ReferralLink[]>>;
  setSkuReseller: (actor: Actor, itemId: string, inProgram: boolean) => Promise<ActionResult<InventoryItem>>;
  addSku: (actor: Actor, input: engine.NewSkuInput) => Promise<ActionResult<InventoryItem>>;
  setSkuSrp: (actor: Actor, itemId: string, srp: number) => Promise<ActionResult<InventoryItem>>;
  addProduct: (actor: Actor, input: engine.ProductInput) => Promise<ActionResult<MasterProduct>>;
  updateProduct: (actor: Actor, id: string, patch: engine.ProductPatch) => Promise<ActionResult<MasterProduct>>;
  deleteProduct: (actor: Actor, id: string) => Promise<ActionResult<MasterProduct>>;
  importProducts: (
    actor: Actor,
    merchantId: string,
    rows: engine.ProductRow[],
  ) => Promise<ActionResult<{ created: number; updated: number; unchanged: number }>>;
  importSkus: (actor: Actor, rows: engine.SkuRow[], defaultCategory?: InventoryItem['category']) => Promise<ActionResult<{ created: number }>>;
  setSkuPackage: (actor: Actor, itemId: string, on: boolean) => Promise<ActionResult<boolean>>;
  setSkuCategory: (actor: Actor, itemIds: string[], category: InventoryItem['category']) => Promise<ActionResult<number>>;
  resetDemo: () => void;
  /** Account management. Live mode only (null in the demo). */
  team: TeamTools | null;
  /** True when the data lives on the server (real sign-in). False = demo data saved in this browser. */
  remote: boolean;
}

// Bumped whenever the saved data shape changes.
const STORAGE_KEY = 'sdsi-wellness:v18';

const createInitialState = (): AppState => ({
  items: MOCK_INVENTORY.map((item) => ({ ...item })),
  products: MOCK_PRODUCTS.map((product) => ({ ...product })),
  orders: MOCK_ORDERS.map((order) => ({ ...order, lines: order.lines.map((line) => ({ ...line })) })),
  receipts: MOCK_RECEIPTS.map((receipt) => ({ ...receipt, lines: receipt.lines.map((line) => ({ ...line })) })),
  reversals: MOCK_REVERSALS.map((request) => ({ ...request })),
  remittances: MOCK_REMITTANCES.map((remittance) => ({ ...remittance, orderIds: [...remittance.orderIds] })),
  costing: {
    settings: { ...MOCK_COSTING.settings },
    rows: MOCK_COSTING.rows.map((row) => ({ ...row })),
    log: [],
    programMerchantIds: [...MOCK_COSTING.programMerchantIds],
    referrals: (MOCK_COSTING.referrals ?? []).map((link) => ({ ...link })),
  },
  users: MOCK_USERS.map((user) => ({ ...user })),
  outbox: [],
  earningPayouts: [],
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
        if (isSavedState(parsed)) {
          commit({
            ...parsed,
            earningPayouts: Array.isArray(parsed.earningPayouts) ? parsed.earningPayouts : [],
            products: Array.isArray(parsed.products) ? parsed.products.map(normalizeProduct) : [],
            items: parsed.items.map((item) => ({ ...item, category: normalizeCategory(item.category) })),
          });
        }
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
      if (isViewOnly()) return Promise.resolve({ ok: false, error: VIEW_ONLY_MESSAGE });
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
      products: state.products,
      orders: state.orders,
      receipts: state.receipts,
      reversals: state.reversals,
      remittances: state.remittances,
      packageSales: state.packageSales,
      earningPayouts: state.earningPayouts,
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
      transferStock: (actor, input) => run((s) => engine.transferStock(s, actor, input, nowISO())),
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
      requestEarningPayout: (actor, amountHkd) => run((st) => engine.requestEarningPayout(st, actor, amountHkd, nowISO())),
      markEarningPaid: (actor, payoutId, reference) => run((st) => engine.markEarningPaid(st, actor, payoutId, reference, nowISO())),
      cancelEarningPayout: (actor, payoutId) => run((st) => engine.cancelEarningPayout(st, actor, payoutId)),
      setReferralLinks: (actor, input) => run((st) => engine.setReferralLinks(st, actor, input, nowISO())),
      setMerchantReferrer: (actor, merchantId, userId) =>
        run((st) => engine.setMerchantReferrer(st, actor, merchantId, userId, nowISO())),
      setProgramMerchant: (actor, merchantId, on) =>
        run((s) => engine.setProgramMerchant(s, actor, merchantId, on, nowISO())),
      setSkuReseller: (actor, itemId, inProgram) =>
        run((s) => engine.setSkuReseller(s, actor, itemId, inProgram, nowISO())),
      setSkuDisabled: (actor, itemId, disabled) =>
        run((s) => engine.setSkuDisabled(s, actor, itemId, disabled, nowISO())),
      addSku: (actor, input) => run((s) => engine.addSku(s, actor, input, nowISO())),
      setSkuSrp: (actor, itemId, srp) => run((s) => engine.setSkuSrp(s, actor, itemId, srp, nowISO())),
      addProduct: (actor, input) => run((s) => engine.addProduct(s, actor, input, nowISO())),
      updateProduct: (actor, id, patch) => run((s) => engine.updateProduct(s, actor, id, patch, nowISO())),
      deleteProduct: (actor, id) => run((s) => engine.deleteProduct(s, actor, id, nowISO())),
      importProducts: (actor, merchantId, rows) => run((s) => engine.importProducts(s, actor, merchantId, rows, nowISO())),
      importSkus: (actor, rows, defaultCategory) => run((s) => engine.importSkus(s, actor, rows, nowISO(), defaultCategory)),
      setSkuPackage: (actor, itemId, on) => run((s) => engine.setSkuPackage(s, actor, itemId, on, nowISO())),
      setSkuCategory: (actor, itemIds, category) => run((s) => engine.setSkuCategory(s, actor, itemIds, category, nowISO())),
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
