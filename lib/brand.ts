export const BRAND = {
  name: 'SDSI Wellness',
  tagline: 'Fulfillment & merchant portal',
} as const;

/** Warn when current stock would last fewer days than this at the recent sales pace. */
export const COVER_WARNING_DAYS = 30;

/** Products expiring within this many days are flagged "Expiring soon". */
export const EXPIRY_WARNING_DAYS = 90;

/**
 * SDSI's top-up is the costing mark-up (Costing settings, now 50%) on the merchant's Net SRP,
 * e.g. 1,485 - 990 = 495 for a 990 SRP. It is an ESTIMATE in pesos. The real top-up is the pickup /
 * COD price (HKD, converted) less what is remitted to the merchant, to be done later.
 */
