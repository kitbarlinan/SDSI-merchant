import type { Category, PaymentMethod, SalesChannel } from './types';

/** Hex colors for SVG charts. Kept in one place so every chart agrees. */
export const CATEGORY_COLORS: Record<Category, string> = {
  'Greens & Superfoods': '#059669',
  Herbal: '#d97706',
  'Vitamins & Minerals': '#0284c7',
  'Beauty & Skin': '#e11d48',
  'Heart & Wellness': '#7c3aed',
};

export const CHANNEL_COLORS: Record<SalesChannel, string> = {
  'Direct Sales': '#059669',
  Shopee: '#f97316',
  'TikTok Shop': '#334155',
  Shopify: '#65a30d',
  'Retail Branch': '#0ea5e9',
};

export const PAYMENT_COLORS: Record<PaymentMethod, string> = {
  Cash: '#64748b',
  GCash: '#2563eb',
  Maya: '#16a34a',
  'Bank Transfer': '#7c3aed',
  Card: '#db2777',
};

export const REVENUE_COLOR = '#10b981';
export const PROFIT_COLOR = '#f59e0b';
