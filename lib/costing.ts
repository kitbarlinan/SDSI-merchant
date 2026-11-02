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
import type { InventoryItem, PackageSale, User } from './types';

export interface CostingSettings {
  /** Mark-up on the merchant's SRP, percent. */
  markupPct: number;
  /** How many PHP are 1 HKD. Update it whenever the rate changes. */
  fxPhpPerHkd: number;
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
  /** Tier income of the upline, percent of the package SRP. Level 1, 2 and 3 above the buyer. Paid out of SDSI's top-up. */
  tierL1Pct: number;
  tierL2Pct: number;
  tierL3Pct: number;
}

/** Values from the costing sheet. The exchange rate matches the sheet's 1,485 PHP = 182.36 HKD. */
export const DEFAULT_COSTING_SETTINGS: CostingSettings = {
  markupPct: 50,
  fxPhpPerHkd: 8.1432,
  sfPerQtyHkd: 5,
  shippingFeeHkd: 34,
  cfRatePct: 2.5,
  cfMinHkd: 5,
  resellerDiscountPct: 15,
  packageHkd: 350,
  packageSrpPhp: 990,
  tierL1Pct: 2,
  tierL2Pct: 2,
  tierL3Pct: 1,
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
}

/** In the reseller program: the merchant is in it and the SKU was not switched off. */
export const inResellerProgram = (item: InventoryItem, costing: CostingState): boolean =>
  costing.programMerchantIds.includes(item.merchantId) && !item.resellerOff;

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
  /** Only the program products get the discount. */
  discountHkd: number;
  /** The same discount in PHP at today's rate. It comes off the merchant's net payable. */
  discountPhp: number;
  /** What the reseller pays at pickup, HKD. */
  amountHkd: number;
}

/**
 * Reseller order pricing. The discount is a fixed percent of the pickup price (HKD), only on products in the
 * reseller program, and the merchant carries it.
 * null when a line has no live price.
 */
export function resellerCharges(
  lines: { itemId: string; quantity: number; total: number }[],
  items: InventoryItem[],
  costing: CostingState,
): ResellerCharges | null {
  const all = orderCharges(lines, costing);
  if (!all) return null;
  let eligiblePickup = 0;
  for (const line of lines) {
    const item = items.find((candidate) => candidate.id === line.itemId);
    if (!item || !inResellerProgram(item, costing)) continue;
    eligiblePickup += (livePickup(costing, line.itemId) ?? 0) * line.quantity;
  }
  const { resellerDiscountPct, fxPhpPerHkd } = costing.settings;
  const discountHkd = roundMoney((eligiblePickup * resellerDiscountPct) / 100);
  return {
    pickupHkd: all.pickupHkd,
    discountHkd,
    discountPhp: roundMoney(discountHkd * fxPhpPerHkd),
    amountHkd: roundMoney(all.pickupHkd - discountHkd),
  };
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
  sfPerQtyHkd: { label: 'SF per qty', min: 0, max: 1000 },
  shippingFeeHkd: { label: 'Shipping fee', min: 0, max: 10_000 },
  cfRatePct: { label: 'Collection fee %', min: 0, max: 100 },
  cfMinHkd: { label: 'Minimum collection fee', min: 0, max: 1000 },
  resellerDiscountPct: { label: 'Reseller discount %', min: 0, max: 90 },
  packageHkd: { label: 'Package price', min: 0, max: 100_000 },
  packageSrpPhp: { label: 'Package SRP', min: 0, max: 1_000_000 },
  tierL1Pct: { label: 'Tier level 1 %', min: 0, max: 50 },
  tierL2Pct: { label: 'Tier level 2 %', min: 0, max: 50 },
  tierL3Pct: { label: 'Tier level 3 %', min: 0, max: 50 },
};

export const SETTING_LABEL: Record<keyof CostingSettings, string> = {
  markupPct: 'Mark-up (%)',
  fxPhpPerHkd: 'Exchange rate (PHP per 1 HKD)',
  sfPerQtyHkd: 'SF added to basis, per qty (HKD)',
  shippingFeeHkd: 'Shipping fee, SF (HKD)',
  cfRatePct: 'Collection fee rate (%)',
  cfMinHkd: 'Minimum collection fee (HKD)',
  resellerDiscountPct: 'Reseller discount (%)',
  packageHkd: 'Reseller package price (HKD)',
  packageSrpPhp: 'Reseller package SRP basis (PHP)',
  tierL1Pct: 'Tier income level 1 (% of package SRP)',
  tierL2Pct: 'Tier income level 2 (% of package SRP)',
  tierL3Pct: 'Tier income level 3 (% of package SRP)',
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
    pickupPriceHkd: computeCosting(item.unitPrice, 1, null, settings).suggestedPickupHkd,
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
  tiers: { level: 1 | 2 | 3; userId: string; pct: number; php: number }[];
  /** SDSI's net: gross top-up, less the reseller share and the tier income actually paid. */
  netPhp: number;
}

/**
 * Split of one reseller package, worked out on its SRP basis (990 -> 50% mark-up 495, reseller 15% 148.50,
 * tier 5% 49.50, net 30% 297). `upline` lists the sponsors above the buyer, nearest first. A level with no
 * active reseller pays nobody and stays with SDSI.
 */
export function packageBreakdown(settings: CostingSettings, upline: string[]): PackageBreakdown {
  const srp = settings.packageSrpPhp;
  const pcts = [settings.tierL1Pct, settings.tierL2Pct, settings.tierL3Pct];
  const tiers = upline.slice(0, 3).map((userId, index) => ({
    level: (index + 1) as 1 | 2 | 3,
    userId,
    pct: pcts[index],
    php: roundMoney((srp * pcts[index]) / 100),
  }));
  const grossPhp = roundMoney((srp * settings.markupPct) / 100);
  const resellerPhp = roundMoney((srp * settings.resellerDiscountPct) / 100);
  const paid = roundMoney(tiers.reduce((sum, tier) => sum + tier.php, 0));
  return {
    grossPhp,
    resellerPhp,
    tierPoolPhp: roundMoney((srp * pcts.reduce((a, b) => a + b, 0)) / 100),
    tiers,
    netPhp: roundMoney(grossPhp - resellerPhp - paid),
  };
}

/** The active resellers above a buyer, nearest first, up to 3 levels. A sponsor who is not active yet is skipped. */
export function uplineOf(users: User[], activeIds: Set<string>, buyerId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([buyerId]);
  let current = users.find((user) => user.id === buyerId)?.sponsorId;
  while (current && !seen.has(current) && chain.length < 3) {
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
): PackageSale {
  const split = packageBreakdown(settings, upline);
  return {
    id,
    resellerId: buyer.id,
    resellerName: buyer.name,
    createdAt,
    recordedBy,
    hkd: settings.packageHkd,
    srpPhp: settings.packageSrpPhp,
    grossPhp: split.grossPhp,
    resellerPhp: split.resellerPhp,
    tiers: split.tiers,
    netPhp: split.netPhp,
  };
}
