export const BRAND = {
  name: 'SDSI Wellness',
  tagline: 'Fulfillment & merchant portal',
} as const;

/** Warn when current stock would last fewer days than this at the recent sales pace. */
export const COVER_WARNING_DAYS = 30;

/** Products expiring within this many days are flagged "Expiring soon". */
export const EXPIRY_WARNING_DAYS = 90;

/**
 * PLACEHOLDER. SDSI fulfills orders for merchants, so merchant sales are NOT SDSI revenue.
 * SDSI's own income is a top-up on fulfilled orders. The real rate is still to be decided;
 * Admin can change it on the Accounting page. Each delivered order keeps the rate it was
 * delivered with, so changing it later never rewrites past orders.
 */
export const DEFAULT_TOP_UP_PERCENT = 5;
