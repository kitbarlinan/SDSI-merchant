/**
 * Costing for COD pickup pricing (Hong Kong). Pure functions, no UI.
 *
 * One row per SKU (solo and twin pack are separate SKUs with their own codes), following the costing sheet.
 * "qty" is the number of pieces inside the SKU (1 for solo, 2 for a twin pack) and only drives the +5 HKD.
 *
 *   Net SRP (PHP)        = merchant SRP of the SKU
 *   50% MU (PHP)         = Net SRP x (1 + markup%)               <- gross payable
 *   Basis HKD            = 50% MU / PHP-per-HKD rate             (rounded to 2 decimals)
 *   Final basis          = Basis HKD + 5 HKD x qty               (the +5 applies to EVERY piece)
 *   Pickup price (HKD)   = set by the admin by hand (the basis is only a guide)
 *   SF                   = 34 HKD, automatic
 *   CF (collection fee)  = (Pickup price + SF) x 2.5%, rounded to a whole HKD, never below 5 HKD
 *   Net COD price        = Pickup price + SF + CF
 *   Net remittance (PHP) = Net SRP (what goes back to the merchant)
 *
 * Example from the sheet: SRP 990, qty 1 -> 1,485 -> 182.36 -> 187.36, pickup 188,
 * SF 34, CF 5.55 -> 6, net COD 228.
 */
import { roundMoney } from './format';
import type { InventoryItem, OrderDeductions, PackageSale, PaymentMethod, TierShare, User } from './types';

export interface CostingSettings {
  /** Mark-up on the merchant's SRP, percent. */
  markupPct: number;
  /** How many PHP are 1 HKD. Update it whenever the rate changes. */
  fxPhpPerHkd: number;
  /** The actual bank rate used for payouts and wallets (PHP per 1 HKD). It is locked on each order when it is delivered. */
  payoutFxPhpPerHkd: number;
  /** Added to the basis for every unit, in HKD. */
  sfPerQtyHkd: number;
  /** Shipping fee (SF) added to every package, in HKD. */
  shippingFeeHkd: number;
  /** Collection fee rate, percent of (pickup price + SF). */
  cfRatePct: number;
  /** The collection fee is never lower than this, in HKD. */
  cfMinHkd: number;
  /** Discount for resellers / customers with a login, percent of the pickup price. Charged to the merchant. */
  resellerDiscountPct: number;
  /** Price of the reseller package, HKD. Buying it makes someone a reseller. */
  packageHkd: number;
  /** SRP basis of the package in PHP. The mark-up, the reseller share and the tier income are worked out on it. */
  packageSrpPhp: number;
  /** Tier income of the upline, percent of the package SRP. Level 1 and 2 above the buyer. Charged to the merchant, not to Yellow Basket. */
  tierL1Pct: number;
  tierL2Pct: number;
  /** Referrer share, percent of the SRP basis. Charged to the merchant. */
  referrerPct: number;
  /** System fee, percent of the SRP basis. Charged to the merchant. */
  systemFeePct: number;
}

/** Values from the costing sheet. The exchange rate matches the sheet's 1,485 PHP = 182.36 HKD. */
export const DEFAULT_COSTING_SETTINGS: CostingSettings = {
  markupPct: 50,
  fxPhpPerHkd: 8.0388,
  payoutFxPhpPerHkd: 8.0388,
  sfPerQtyHkd: 5,
  shippingFeeHkd: 34,
  cfRatePct: 2.5,
  cfMinHkd: 5,
  resellerDiscountPct: 10,
  packageHkd: 350,
  packageSrpPhp: 990,
  tierL1Pct: 2,
  tierL2Pct: 2,
  referrerPct: 5,
  systemFeePct: 1,
};

/**
 * draft    = being worked on, not used anywhere yet
 * approved = checked and approved, waiting to go live
 * live     = used by orders
 */
export type CostingStatus = 'draft' | 'approved' | 'live';

/** What orders actually use. Frozen when the package goes live, so later edits never change it silently. */
export interface LiveCosting {
  pickupPriceHkd: number;
  sfHkd: number;
  cfHkd: number;
  netCodHkd: number;
  netRemittancePhp: number;
  /** YYYY-MM-DDTHH:mm */
  at: string;
  by: string;
}

/** A product at a quantity, with the pickup price the admin chose. */
export interface CostingRow {
  id: string;
  itemId: string;
  qty: number;
  /** HKD. The working price. null until the admin sets it. */
  pickupPriceHkd: number | null;
  status: CostingStatus;
  /** The version orders use. null until the package first goes live. */
  live: LiveCosting | null;
  approvedBy?: string;
  /** YYYY-MM-DDTHH:mm */
  approvedAt?: string;
}

export interface CostingLogEntry {
  id: string;
  /** YYYY-MM-DDTHH:mm */
  at: string;
  by: string;
  summary: string;
  details: string[];
}

export interface CostingState {
  settings: CostingSettings;
  rows: CostingRow[];
  log: CostingLogEntry[];
  /** Reseller program: merchants whose products carry the reseller discount and the unilevel commission. */
  programMerchantIds: string[];
  /** Referral bonus: the person who brought a merchant in earns the referrer % of that merchant's delivered Net SRP. */
  referrals?: ReferralLink[];
  /** Resellers who have no sponsor land under this person (the top of the chain, e.g. the chairman). */
  rootSponsorId?: string;
  /** People other than resellers who invite resellers with their own code and link. */
  linkHolderIds?: string[];
}

export interface ReferralLink {
  merchantId: string;
  userId: string;
  /** Filled by the server for the referrer's own view (they cannot see the orders themselves). */
  stats?: { orders: number; earnedPhp: number; pendingPhp: number; earnedHkd: number; pendingHkd: number };
}

/** In the reseller program: the merchant is in it and the SKU was not switched off. The package itself never gets the discount. */
export const inResellerProgram = (item: InventoryItem, costing: CostingState): boolean =>
  !item.package && costing.programMerchantIds.includes(item.merchantId) && !item.resellerOff;

export interface CostingResult {
  netSrpPhp: number;
  /** "50% MU": Net SRP plus the mark-up, in PHP. */
  grossPayablePhp: number;
  basisHkd: number;
  finalBasisHkd: number;
  /** Whole-dollar hint for the pickup price. The admin decides the real one. */
  suggestedPickupHkd: number;
  // Everything below needs a pickup price.
  pickupPriceHkd: number | null;
  sfHkd: number | null;
  /** Collection fee before rounding and before the minimum (the grey 5.55 in the sheet). */
  cfRawHkd: number | null;
  cfHkd: number | null;
  netCodHkd: number | null;
  netRemittancePhp: number;
}

/** Rounds to a whole number, halves up, ignoring floating point dust (5.5000000001 stays 5.5 -> 6). */
const roundWhole = (value: number): number => Math.round(Math.round(value * 1_000_000) / 1_000_000);

export function collectionFee(
  pickupPriceHkd: number,
  settings: CostingSettings,
): { raw: number; fee: number } {
  const raw = ((pickupPriceHkd + settings.shippingFeeHkd) * settings.cfRatePct) / 100;
  return { raw: roundMoney(raw), fee: Math.max(settings.cfMinHkd, roundWhole(raw)) };
}

export function computeCosting(
  srpPhp: number,
  qty: number,
  pickupPriceHkd: number | null,
  settings: CostingSettings,
): CostingResult {
  const netSrpPhp = roundMoney(srpPhp);
  const grossPayablePhp = roundMoney(netSrpPhp * (1 + settings.markupPct / 100));
  const basisHkd = roundMoney(grossPayablePhp / settings.fxPhpPerHkd);
  const finalBasisHkd = roundMoney(basisHkd + settings.sfPerQtyHkd * qty);
  const base = {
    netSrpPhp,
    grossPayablePhp,
    basisHkd,
    finalBasisHkd,
    suggestedPickupHkd: Math.ceil(finalBasisHkd),
    netRemittancePhp: netSrpPhp,
  };
  if (pickupPriceHkd === null) {
    return { ...base, pickupPriceHkd: null, sfHkd: null, cfRawHkd: null, cfHkd: null, netCodHkd: null };
  }
  const { raw, fee } = collectionFee(pickupPriceHkd, settings);
  return {
    ...base,
    pickupPriceHkd,
    sfHkd: settings.shippingFeeHkd,
    cfRawHkd: raw,
    cfHkd: fee,
    netCodHkd: roundMoney(pickupPriceHkd + settings.shippingFeeHkd + fee),
  };
}

export const costingRowFor = (rows: CostingRow[], itemId: string): CostingRow | undefined =>
  rows.find((row) => row.itemId === itemId);

/** SF, CF and net COD (HKD) of an order, from the LIVE costing only. */
export interface OrderCharges {
  /** Sum of the live pickup prices. */
  pickupHkd: number;
  sfHkd: number;
  cfHkd: number;
  netCodHkd: number;
}

/**
 * Charges for one order (one POID):
 *   - SF is charged ONCE per order, never per item.
 *   - CF is worked out on the order's TOTAL collection: (sum of the pickup prices + SF) x CF rate,
 *     rounded to a whole HKD, never below the minimum.
 *   - Net COD = sum of pickup prices + SF + CF.
 * Each line is priced as quantity x the SKU's LIVE pickup price. null when any line has no live price,
 * so a partial number is never shown as complete.
 */
export function orderCharges(
  lines: { itemId: string; quantity: number }[],
  costing: CostingState,
): OrderCharges | null {
  if (lines.length === 0) return null;
  let pickupTotal = 0;
  for (const line of lines) {
    const live = costingRowFor(costing.rows, line.itemId)?.live;
    if (!live) return null;
    pickupTotal += live.pickupPriceHkd * line.quantity;
  }
  pickupTotal = roundMoney(pickupTotal);
  const sfHkd = costing.settings.shippingFeeHkd;
  const cfHkd = collectionFee(pickupTotal, costing.settings).fee;
  return { pickupHkd: pickupTotal, sfHkd, cfHkd, netCodHkd: roundMoney(pickupTotal + sfHkd + cfHkd) };
}

export interface ResellerCharges {
  /** Pickup price of the whole order, HKD (before the discount). */
  pickupHkd: number;
  /** SRP (PHP) of the program products. The discount and the tier income are worked out on it. */
  eligibleSrpPhp: number;
  /** Discount in HKD, shown to the reseller. */
  discountHkd: number;
  /** The same discount in PHP (HKD x the rate). It is charged to the merchant, not to the top-up. */
  discountPhp: number;
  /** What the reseller pays at pickup, HKD. */
  amountHkd: number;
}

/**
 * Reseller order pricing. The discount is a percent of the pickup price (HKD) of the program products and is taken off
 * the pickup price. The discount is charged to the merchant; Yellow Basket's top-up stays as is.
 * null when a line has no live price.
 */
export function resellerCharges(
  lines: { itemId: string; quantity: number; total: number }[],
  items: InventoryItem[],
  costing: CostingState,
): ResellerCharges | null {
  const all = orderCharges(lines, costing);
  if (!all) return null;
  let eligibleSrp = 0;
  let eligiblePickupHkd = 0;
  for (const line of lines) {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item || !inResellerProgram(item, costing)) continue;
    eligibleSrp += line.total;
    eligiblePickupHkd += (livePickup(costing, line.itemId) ?? 0) * line.quantity;
  }
  const { resellerDiscountPct, fxPhpPerHkd } = costing.settings;
  // The discount is a percent of the pickup price (HKD). Its PHP value is what the merchant is charged.
  const discountHkd = roundMoney((eligiblePickupHkd * resellerDiscountPct) / 100);
  const discountPhp = roundMoney(discountHkd * fxPhpPerHkd);
  return {
    pickupHkd: all.pickupHkd,
    eligibleSrpPhp: roundMoney(eligibleSrp),
    discountHkd,
    discountPhp,
    amountHkd: roundMoney(all.pickupHkd - discountHkd),
  };
}

/** Tier income of a purchase: each active sponsor above the buyer gets a percent of the SRP, levels 1 and 2. */
export function orderTiers(settings: CostingSettings, upline: string[], srpPhp: number): TierShare[] {
  const pcts = [settings.tierL1Pct, settings.tierL2Pct];
  return upline.slice(0, 2).map((userId, index) => ({
    level: (index + 1) as 1 | 2,
    userId,
    pct: pcts[index],
    php: roundMoney((srpPhp * pcts[index]) / 100),
  }));
}

/** The live pickup price (HKD) of one SKU, or null when it has none. */
export const livePickup = (costing: CostingState, itemId: string): number | null =>
  costingRowFor(costing.rows, itemId)?.live?.pickupPriceHkd ?? null;

/** Freezes the current working price and settings into what orders will use. */
export function snapshotLive(
  unitSrpPhp: number,
  row: CostingRow,
  settings: CostingSettings,
  by: string,
  at: string,
): LiveCosting | null {
  if (row.pickupPriceHkd === null) return null;
  const result = computeCosting(unitSrpPhp, row.qty, row.pickupPriceHkd, settings);
  return {
    pickupPriceHkd: row.pickupPriceHkd,
    sfHkd: result.sfHkd!,
    cfHkd: result.cfHkd!,
    netCodHkd: result.netCodHkd!,
    netRemittancePhp: result.netRemittancePhp,
    at,
    by,
  };
}

/** A SKU can be sold only when it is not disabled and at least one of its packages is live. */
export const isSellable = (item: Pick<InventoryItem, 'id' | 'disabled'>, costing: CostingState): boolean =>
  !item.disabled && costing.rows.some((row) => row.itemId === item.id && row.live !== null);

/** SKU codes are unique, case-insensitive, and never reused, even after the SKU is disabled. */
export function validateSkuCode(code: string, existing: { sku: string }[]): string | null {
  const sku = code.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,29}$/.test(sku)) {
    return 'SKU code: 2 to 30 letters, numbers, dots, dashes or underscores.';
  }
  if (existing.some((item) => item.sku.toLowerCase() === sku.toLowerCase())) {
    return `SKU code ${sku.toUpperCase()} already exists. Change the SKU code.`;
  }
  return null;
}

/** Pickup price must be a positive amount with at most 2 decimals. */
export function validatePickupPrice(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return 'Enter a pickup price above 0.';
  if (value > 100_000) return 'That pickup price looks too high.';
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return 'Use at most 2 decimal places.';
  return null;
}

const RANGES: Record<keyof CostingSettings, { label: string; min: number; max: number; exclusiveMin?: boolean }> = {
  markupPct: { label: 'Mark-up %', min: 0, max: 500 },
  fxPhpPerHkd: { label: 'Exchange rate', min: 0, max: 1000, exclusiveMin: true },
  payoutFxPhpPerHkd: { label: 'Payout rate', min: 0, max: 1000, exclusiveMin: true },
  sfPerQtyHkd: { label: 'SF per qty', min: 0, max: 1000 },
  shippingFeeHkd: { label: 'Shipping fee', min: 0, max: 10_000 },
  cfRatePct: { label: 'Collection fee %', min: 0, max: 100 },
  cfMinHkd: { label: 'Minimum collection fee', min: 0, max: 1000 },
  resellerDiscountPct: { label: 'Reseller discount %', min: 0, max: 90 },
  packageHkd: { label: 'Package price', min: 0, max: 100_000 },
  packageSrpPhp: { label: 'Package SRP', min: 0, max: 1_000_000 },
  tierL1Pct: { label: 'Tier level 1 %', min: 0, max: 50 },
  tierL2Pct: { label: 'Tier level 2 %', min: 0, max: 50 },
  referrerPct: { label: 'Referrer %', min: 0, max: 50 },
  systemFeePct: { label: 'System fee %', min: 0, max: 50 },
};

export const SETTING_LABEL: Record<keyof CostingSettings, string> = {
  markupPct: 'Mark-up (%)',
  fxPhpPerHkd: 'Costing rate (PHP per 1 HKD) - budget',
  payoutFxPhpPerHkd: 'Payout rate (PHP per 1 HKD) - actual bank rate',
  sfPerQtyHkd: 'SF added to basis, per qty (HKD)',
  shippingFeeHkd: 'Shipping fee, SF (HKD)',
  cfRatePct: 'Collection fee rate (%)',
  cfMinHkd: 'Minimum collection fee (HKD)',
  resellerDiscountPct: 'Reseller discount (% of the pickup price)',
  packageHkd: 'Reseller package price (HKD)',
  packageSrpPhp: 'Reseller package SRP basis (PHP)',
  tierL1Pct: 'Tier income level 1 (% of package SRP)',
  tierL2Pct: 'Tier income level 2 (% of package SRP)',
  referrerPct: 'Referrer (% of SRP basis)',
  systemFeePct: 'System fees (% of SRP basis)',
};

export function validateSettings(patch: Partial<CostingSettings>): string | null {
  for (const [key, value] of Object.entries(patch) as [keyof CostingSettings, number][]) {
    const range = RANGES[key];
    if (!range) return 'Unknown setting.';
    if (!Number.isFinite(value)) return `${range.label}: enter a number.`;
    if (range.exclusiveMin ? value <= range.min : value < range.min) {
      return `${range.label}: must be ${range.exclusiveMin ? 'above' : 'at least'} ${range.min}.`;
    }
    if (value > range.max) return `${range.label}: must be ${range.max} or less.`;
  }
  return null;
}

/** Demo costing: one row per SKU, priced at the suggested pickup price. */
export function buildDemoCosting(items: InventoryItem[], settings = DEFAULT_COSTING_SETTINGS): CostingRow[] {
  const rows: CostingRow[] = items.map((item) => ({
    id: `cst-${item.id.replace('itm-', '')}`,
    itemId: item.id,
    qty: 1,
    pickupPriceHkd: item.package ? item.package.priceHkd : computeCosting(item.unitPrice, 1, null, settings).suggestedPickupHkd,
    status: 'live',
    live: null,
  }));
  // Demo rows start live so the app works out of the box.
  return rows.map((row) => {
    const item = items.find((candidate) => candidate.id === row.itemId)!;
    return { ...row, live: snapshotLive(item.unitPrice, row, settings, 'usr-admin', '2026-10-01T09:00') };
  });
}

export interface PackageBreakdown {
  grossPhp: number;
  resellerPhp: number;
  tierPoolPhp: number;
  referrerPhp: number;
  systemFeePhp: number;
  tiers: { level: 1 | 2; userId: string; pct: number; php: number }[];
  /** Yellow Basket's top-up, as is: the reseller discount, referrer, tiers and system fees are charged to the merchant. */
  netPhp: number;
}

/**
 * Split of one reseller package, worked out on its SRP basis (990 -> 50% mark-up 495, reseller 15% 148.50,
 * tier 5% 49.50, net 30% 297). `upline` lists the sponsors above the buyer, nearest first. A level with no
 * active reseller pays nobody and stays with SDSI.
 */
export function packageBreakdown(settings: CostingSettings, upline: string[]): PackageBreakdown {
  const srp = settings.packageSrpPhp;
  const pcts = [settings.tierL1Pct, settings.tierL2Pct];
  const tiers = upline.slice(0, 2).map((userId, index) => ({
    level: (index + 1) as 1 | 2,
    userId,
    pct: pcts[index],
    php: roundMoney((srp * pcts[index]) / 100),
  }));
  const grossPhp = roundMoney((srp * settings.markupPct) / 100);
  const resellerPhp = roundMoney((srp * settings.resellerDiscountPct) / 100);
  const referrerPhp = roundMoney((srp * settings.referrerPct) / 100);
  const systemFeePhp = roundMoney((srp * settings.systemFeePct) / 100);
  return {
    grossPhp,
    resellerPhp,
    tierPoolPhp: roundMoney((srp * pcts.reduce((a, b) => a + b, 0)) / 100),
    referrerPhp,
    systemFeePhp,
    tiers,
    netPhp: grossPhp,
  };
}

/** The active resellers above a buyer, nearest first, up to 2 levels. A sponsor who is not active yet is skipped. */
export function uplineOf(users: User[], activeIds: Set<string>, buyerId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([buyerId]);
  let current = users.find((user) => user.id === buyerId)?.sponsorId;
  while (current && !seen.has(current) && chain.length < 2) {
    seen.add(current);
    if (activeIds.has(current)) chain.push(current);
    current = users.find((user) => user.id === current)?.sponsorId;
  }
  return chain;
}

/** Builds the record of one package sale with its split. */
export function makePackageSale(
  id: string,
  buyer: User,
  settings: CostingSettings,
  upline: string[],
  recordedBy: string,
  createdAt: string,
  paid?: { hkd: number; srpPhp: number; orderId?: string; paymentMethod?: PaymentMethod },
): PackageSale {
  const split = packageBreakdown(paid ? { ...settings, packageSrpPhp: paid.srpPhp } : settings, upline);
  return {
    id,
    resellerId: buyer.id,
    resellerName: buyer.name,
    createdAt,
    recordedBy,
    hkd: paid?.hkd ?? settings.packageHkd,
    srpPhp: paid?.srpPhp ?? settings.packageSrpPhp,
    orderId: paid?.orderId,
    paymentMethod: paid?.paymentMethod,
    fxRate: settings.payoutFxPhpPerHkd,
    grossPhp: split.grossPhp,
    resellerPhp: split.resellerPhp,
    tiers: split.tiers,
    netPhp: split.netPhp,
  };
}

/** Income sheet of one SKU: top-up 495 as is. The merchant is charged the reseller discount (10% of the pickup price in HKD, 188 -> 18.80 = 151.13 PHP), referrer 5%, tier 4%, fees 1% of the Net SRP, and is paid the rest in HKD. */
export interface SkuIncome {
  grossTopUpPhp: number;
  /** Reseller discount: % of the pickup price in HKD, and its PHP value (HKD x the rate). */
  resellerHkd: number;
  resellerPhp: number;
  referrerPhp: number;
  tierPhp: number;
  systemFeePhp: number;
  /** Total charged to the merchant: reseller + referrer + tier + system fees. */
  deductionsPhp: number;
  /** What the merchant is left with: Net SRP less the deductions (990 -> 792). */
  merchantNetPhp: number;
  /** The payout to the merchant, HKD (net remittance PHP / the rate). */
  payoutHkd: number;
}

export function skuIncome(netSrpPhp: number, settings: CostingSettings, pickupHkd: number | null = null): SkuIncome {
  const part = (pct: number) => roundMoney((netSrpPhp * pct) / 100);
  const grossTopUpPhp = part(settings.markupPct);
  const resellerHkd = pickupHkd === null ? 0 : roundMoney((pickupHkd * settings.resellerDiscountPct) / 100);
  const resellerPhp = roundMoney(resellerHkd * settings.fxPhpPerHkd);
  const referrerPhp = part(settings.referrerPct);
  const tierPhp = part(settings.tierL1Pct + settings.tierL2Pct);
  const systemFeePhp = part(settings.systemFeePct);
  const deductionsPhp = roundMoney(resellerPhp + referrerPhp + tierPhp + systemFeePhp);
  const merchantNetPhp = roundMoney(netSrpPhp - deductionsPhp);
  return {
    grossTopUpPhp,
    resellerHkd,
    resellerPhp,
    referrerPhp,
    tierPhp,
    systemFeePhp,
    deductionsPhp,
    merchantNetPhp,
    payoutHkd: roundMoney(merchantNetPhp / settings.fxPhpPerHkd),
  };
}

/** Settings from storage may lack newer fields (or hold removed ones): fill from the defaults. */
export function normalizeSettings(saved: Record<string, unknown> | undefined): CostingSettings {
  const next = { ...DEFAULT_COSTING_SETTINGS } as unknown as Record<string, number>;
  for (const key of Object.keys(DEFAULT_COSTING_SETTINGS)) {
    const value = saved?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) next[key] = value;
  }
  // The old default reseller discount was 15%; the program now runs on 10%.
  if (saved?.resellerDiscountPct === 15) next.resellerDiscountPct = 10;
  // Settings saved before the payout rate existed: it starts equal to the costing rate.
  if (typeof saved?.payoutFxPhpPerHkd !== 'number' && typeof saved?.fxPhpPerHkd === 'number') next.payoutFxPhpPerHkd = saved.fxPhpPerHkd;
  return next as unknown as CostingSettings;
}

/**
 * RULE (fixed): deductions apply ONLY to the lines in the reseller program. Every other merchant, and every SKU not
 * ticked, is remitted in full (no deduction at all). The 1% system fee will later apply overall: pending decision.
 *
 * What the merchant is charged on a delivered order, on the lines that are in the reseller program (merchant ticked,
 * SKU not switched off): the reseller discount and tier income as recorded on the order, plus the referrer share
 * (when the merchant has a referrer) and the system fee on the SRP of those lines. null when no line is in the program.
 */
export function orderDeductions(
  order: { merchantId: string; lines: { itemId: string; total: number }[]; discountPhp?: number; tiers?: { php: number }[] },
  items: InventoryItem[],
  costing: CostingState,
): OrderDeductions | null {
  let programSrp = 0;
  for (const line of order.lines) {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (item && inResellerProgram(item, costing)) programSrp += line.total;
  }
  if (programSrp <= 0) return null;
  const { referrerPct, systemFeePct } = costing.settings;
  const referred = (costing.referrals ?? []).some((link) => link.merchantId === order.merchantId);
  const resellerPhp = roundMoney(order.discountPhp ?? 0);
  const tierPhp = roundMoney((order.tiers ?? []).reduce((sum, tier) => sum + tier.php, 0));
  const referrerPhp = referred ? roundMoney((programSrp * referrerPct) / 100) : 0;
  const systemFeePhp = roundMoney((programSrp * systemFeePct) / 100);
  return { resellerPhp, referrerPhp, tierPhp, systemFeePhp, totalPhp: roundMoney(resellerPhp + referrerPhp + tierPhp + systemFeePhp) };
}
