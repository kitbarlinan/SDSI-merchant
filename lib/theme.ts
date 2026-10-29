import type { Category, OrderTerms, PaymentMethod } from './types';

/** Hex colors for SVG charts. Kept in one place so every chart agrees. */
export const CATEGORY_COLORS: Record<Category, string> = {
  'Greens & Superfoods': '#059669',
  Herbal: '#d97706',
  'Vitamins & Minerals': '#0284c7',
  'Beauty & Skin': '#e11d48',
  'Heart & Wellness': '#7c3aed',
};

export const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  Cash: '#64748b',
  GCash: '#2563eb',
  Maya: '#16a34a',
  'Bank Transfer': '#7c3aed',
  Card: '#db2777',
};

export const TERMS_COLORS: Record<OrderTerms, string> = {
  COP: '#7c3aed',
  COD: '#0284c7',
};

export const REVENUE_COLOR = '#10b981';
export const PROFIT_COLOR = '#f59e0b';
export const TOP_UP_COLOR = '#7c3aed';
