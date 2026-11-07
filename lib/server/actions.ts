/**
 * Every change the app can make, by name. The browser sends { action, args }; the server decides WHO is
 * acting from the sign-in, never from the request. Server only.
 */
import * as engine from '../engine';
import type { Actor, AppState, Outcome } from '../engine';
import type { User } from '../types';

type Args = Record<string, unknown>;
type Handler = (state: AppState, actor: Actor, a: Args, now: string) => Outcome<unknown>;

/* The arguments come from the browser as JSON. The engine checks every business rule; here the shape is
   only cast, because a wrong shape fails inside the engine's own checks. */
const s = (v: unknown) => v as string;
const n = (v: unknown) => v as number;

export const ACTIONS: Record<string, Handler> = {
  placeOrder: (st, ac, a, now) => engine.placeMerchantOrder(st, ac, a.input as never, now),
  placeResellerOrder: (st, ac, a, now) => engine.placeResellerOrder(st, ac, a.input as never, now),
  checkoutWalkIn: (st, ac, a, now) => engine.checkoutWalkIn(st, ac, a.input as never, now),
  markPacked: (st, ac, a, now) => engine.markPacked(st, ac, s(a.orderId), now),
  shipOrder: (st, ac, a, now) => engine.shipOrder(st, ac, s(a.orderId), s(a.waybill), now),
  markDelivered: (st, ac, a, now) => engine.markDelivered(st, ac, s(a.orderId), a.paymentMethod as never, now),
  markRts: (st, ac, a, now) => engine.markRts(st, ac, s(a.orderId), s(a.reason), now),
  cancelOrder: (st, ac, a, now) => engine.cancelOrder(st, ac, s(a.orderId), s(a.reason), now),
  transferStock: (st, ac, a, now) => engine.transferStock(st, ac, a.input as never, now),
  receiveStock: (st, ac, a, now) => engine.createStockInReceipt(st, ac, a.input as never, now),
  receiveReturn: (st, ac, a, now) => engine.createReturnReceipt(st, ac, a.input as never, now),
  approveReceipt: (st, ac, a, now) => engine.approveReceipt(st, ac, s(a.receiptId), now),
  rejectReceipt: (st, ac, a, now) => engine.rejectReceipt(st, ac, s(a.receiptId), s(a.reason), now),
  setPickupPrices: (st, ac, a, now) => engine.setPickupPrices(st, ac, a.changes as never, now),
  setCostingSettings: (st, ac, a, now) => engine.setCostingSettings(st, ac, a.patch as never, now),
  removeCostingRow: (st, ac, a, now) => engine.removeCostingRow(st, ac, s(a.rowId), now),
  bulkCostingRows: (st, ac, a, now) => engine.bulkCostingRows(st, ac, a.kind as 'approve' | 'live', a.rowIds as string[], now),
  bulkSkuDisabled: (st, ac, a, now) => engine.bulkSkuDisabled(st, ac, a.itemIds as string[], Boolean(a.disabled), now),
  approveCostingRow: (st, ac, a, now) => engine.approveCostingRow(st, ac, s(a.rowId), now),
  revokeApproval: (st, ac, a, now) => engine.revokeApproval(st, ac, s(a.rowId), now),
  goLiveCostingRow: (st, ac, a, now) => engine.goLiveCostingRow(st, ac, s(a.rowId), now),
  requestReversal: (st, ac, a, now) => engine.requestReversal(st, ac, s(a.orderId), s(a.note), now),
  approveReversal: (st, ac, a, now) => engine.approveReversal(st, ac, s(a.requestId), now),
  rejectReversal: (st, ac, a, now) => engine.rejectReversal(st, ac, s(a.requestId), s(a.reason), now),
  closeWeek: (st, ac, a, now) => engine.closeWeek(st, ac, s(a.weekStart), now),
  submitRelease: (st, ac, a, now) => engine.submitRelease(st, ac, s(a.remittanceId), a.input as never, now),
  approveRelease: (st, ac, a, now) => engine.approveRelease(st, ac, s(a.remittanceId), now),
  rejectRelease: (st, ac, a, now) => engine.rejectRelease(st, ac, s(a.remittanceId), s(a.reason), now),
  setSkuDisabled: (st, ac, a, now) => engine.setSkuDisabled(st, ac, s(a.itemId), a.disabled === true, now),
  requestEarningPayout: (st, ac, a, now) => engine.requestEarningPayout(st, ac, n(a.amountHkd), now),
  markEarningPaid: (st, ac, a, now) => engine.markEarningPaid(st, ac, s(a.payoutId), s(a.reference), now),
  cancelEarningPayout: (st, ac, a) => engine.cancelEarningPayout(st, ac, s(a.payoutId)),
  setReferralLinks: (st, ac, a, now) => engine.setReferralLinks(st, ac, { rootSponsorId: a.rootSponsorId ? s(a.rootSponsorId) : null, linkHolderIds: Array.isArray(a.linkHolderIds) ? a.linkHolderIds.map((id) => s(id)) : [] }, now),
  setMerchantReferrer: (st, ac, a, now) => engine.setMerchantReferrer(st, ac, s(a.merchantId), a.userId ? s(a.userId) : null, now),
  setProgramMerchant: (st, ac, a, now) => engine.setProgramMerchant(st, ac, s(a.merchantId), a.on === true, now),
  setSkuReseller: (st, ac, a, now) => engine.setSkuReseller(st, ac, s(a.itemId), a.inProgram === true, now),
  addSku: (st, ac, a, now) => engine.addSku(st, ac, a.input as never, now),
  setSkuSrp: (st, ac, a, now) => engine.setSkuSrp(st, ac, s(a.itemId), n(a.srp), now),
  addProduct: (st, ac, a, now) => engine.addProduct(st, ac, a.input as never, now),
  updateProduct: (st, ac, a, now) => engine.updateProduct(st, ac, s(a.id), a.patch as never, now),
  deleteProduct: (st, ac, a, now) => engine.deleteProduct(st, ac, s(a.id), now),
  importProducts: (st, ac, a, now) => engine.importProducts(st, ac, s(a.merchantId), a.rows as never, now),
  importSkus: (st, ac, a, now) => engine.importSkus(st, ac, a.rows as never, now, a.defaultCategory as never),
  setSkuPackage: (st, ac, a, now) => engine.setSkuPackage(st, ac, s(a.itemId), a.on === true, now),
  setSkuCategory: (st, ac, a, now) => engine.setSkuCategory(st, ac, a.itemIds as never, a.category as never, now),
};

/** Actions anyone can call without signing in. */
export const PUBLIC_ACTIONS: Record<string, (state: AppState, a: Args, now: string) => Outcome<unknown>> = {
  applyForReseller: (st, a, now) => engine.applyForReseller(st, a.input as never, now),
};

export const actorOf = (user: User): Actor => ({
  id: user.id,
  role: user.role,
  merchantId: user.merchantId,
  branchId: user.branchId,
  sponsorId: user.sponsorId,
});

void n;
