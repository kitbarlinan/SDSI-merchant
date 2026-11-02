import type { Category, OrderTerms, PaymentMethod } from './types';

/** Hex colors for SVG charts. Kept in one place so every chart agrees. */
export const CATEGORY_COLORS: Record<Category, string> = {
  'Greens & Superfoods': '#d99a00',
  Herbal: '#d97706',
  'Vitamins & Minerals': '#0284c7',
  'Beauty & Skin': '#e11d48',
  'Heart & Wellness': '#7c3aed',
};

export const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  Cash: '#64748b',
  'Bank Transfer': '#7c3aed',
  'Debit / Credit Card': '#db2777',
};

export const TERMS_COLORS: Record<OrderTerms, string> = {
  COP: '#7c3aed',
  COD: '#0284c7',
};

export const REVENUE_COLOR = '#F5B800';
export const PROFIT_COLOR = '#0f766e';
export const TOP_UP_COLOR = '#7c3aed';
