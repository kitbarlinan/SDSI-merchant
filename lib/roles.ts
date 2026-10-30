import type { Role } from './types';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  cashier: 'Cashier',
  clerk: 'Inventory Clerk',
  merchant: 'Merchant',
  customer: 'Reseller',
};

/** Where each role lands after signing in. */
export const homeFor = (role: Role): string => (role === 'cashier' || role === 'customer' ? '/orders' : role === 'clerk' ? '/approvals' : '/dashboard');

/** Handles orders and the counter. */
export const isStaff = (role: Role): boolean => role === 'admin' || role === 'cashier';

/** Approves received stock. */
export const canApprove = (role: Role): boolean => role === 'admin' || role === 'clerk';

/** Works for SDSI (everyone except merchants). */
export const isSdsiTeam = (role: Role): boolean => role !== 'merchant' && role !== 'customer';
