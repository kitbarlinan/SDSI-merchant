import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  cashier: 'Cashier',
  merchant: 'Merchant',
};

/** Where each role lands after signing in. */
export const homeFor = (role: Role): string => (role === 'cashier' ? '/orders' : '/dashboard');

export const isStaff = (role: Role): boolean => role === 'admin' || role === 'cashier';
