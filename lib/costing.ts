/**
 * Costing for COD pickup pricing (Hong Kong). Pure functions, no UI.
 *
 * Per package (a product and a quantity), following the costing sheet:
 *
 *   Net SRP (PHP)        = merchant SRP x qty
 *   50% MU (PHP)         = Net SRP x (1 + markup%)               <- gross payable
 *   Basis HKD            = 50% MU / PHP-per-HKD rate             (rounded to 2 decimals)
 *   Final basis          = Basis HKD + 5 HKD x qty               (the +5 applies to EVERY unit)
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
import type { InventoryItem } from './types';

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
}

/** Values from the costing sheet. The exchange rate matches the sheet's 1,485 PHP = 182.36 HKD. */
export const DEFAULT_COSTING_SETTINGS: CostingSettings = {
  markupPct: 50,
  fxPhpPerHkd: 8.1432,
  sfPerQtyHkd: 5,
  shippingFeeHkd: 34,
  cfRatePct: 2.5,
  cfMinHkd: 5,
};

/** A product at a quantity, with the pickup price the admin chose. */
export interface CostingRow {
  id: string;
  itemId: string;
  qty: number;
  /** HKD. null until the admin sets it. */
  pickupPriceHkd: number | null;
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
}

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
  unitSrpPhp: number,
  qty: number,
  pickupPriceHkd: number | null,
  settings: CostingSettings,
): CostingResult {
  const netSrpPhp = roundMoney(unitSrpPhp * qty);
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

export const costingRowFor = (
  rows: CostingRow[],
  itemId: string,
  qty: number,
): CostingRow | undefined => rows.find((row) => row.itemId === itemId && row.qty === qty);

/**
 * Collection fee (HKD) for an order: the sum of the CF of every line, using the package that
 * matches the line's product and quantity. null when any line has no package or no pickup price yet,
 * so a partial number is never shown as if it were complete.
 */
export function orderCollectionFee(
  lines: { itemId: string; quantity: number }[],
  costing: CostingState,
): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    const row = costingRowFor(costing.rows, line.itemId, line.quantity);
    if (!row || row.pickupPriceHkd === null) return null;
    total += collectionFee(row.pickupPriceHkd, costing.settings).fee;
  }
  return roundMoney(total);
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
};

export const SETTING_LABEL: Record<keyof CostingSettings, string> = {
  markupPct: 'Mark-up (%)',
  fxPhpPerHkd: 'Exchange rate (PHP per 1 HKD)',
  sfPerQtyHkd: 'SF added to basis, per qty (HKD)',
  shippingFeeHkd: 'Shipping fee, SF (HKD)',
  cfRatePct: 'Collection fee rate (%)',
  cfMinHkd: 'Minimum collection fee (HKD)',
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

/** Demo packages: every product at qty 1 to 3, priced at the suggested pickup price. */
export function buildDemoCosting(items: InventoryItem[], settings = DEFAULT_COSTING_SETTINGS): CostingRow[] {
  const rows: CostingRow[] = [];
  for (const item of items) {
    for (const qty of [1, 2, 3]) {
      rows.push({
        id: `cst-${item.id.replace('itm-', '')}-${qty}`,
        itemId: item.id,
        qty,
        pickupPriceHkd: computeCosting(item.unitPrice, qty, null, settings).suggestedPickupHkd,
      });
    }
  }
  return rows;
}
