export const BRAND = {
  name: 'SDSI Wellness',
  tagline: 'Supplements sales & inventory',
} as const;

/** Typical supplier lead time (sea cargo). Items with less stock cover than this need reordering. */
export const SUPPLIER_LEAD_TIME_DAYS = 90;

/** Products expiring within this many days are flagged "Expiring soon". */
export const EXPIRY_WARNING_DAYS = 90;
