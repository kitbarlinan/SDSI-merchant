import type { Category, OrderTerms, PaymentMethod } from './types';

/** Hex colors for SVG charts. Kept in one place so every chart agrees. */
export const CATEGORY_COLORS: Record<Category, string> = {
  'Food Supplements': '#d99a00',
  'Beauty Products': '#e11d48',
};

export const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  Cash: '#64748b',
  'Bank Transfer': '#7c3aed',
  'Debit / Credit Card': '#db2777',
  Wallet: '#0d9488',
};

export const TERMS_COLORS: Record<OrderTerms, string> = {
  COP: '#7c3aed',
  COD: '#0284c7',
};

export const REVENUE_COLOR = '#F5B800';
export const PROFIT_COLOR = '#0f766e';
export const TOP_UP_COLOR = '#7c3aed';
