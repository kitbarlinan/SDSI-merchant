import type { OrderTerms } from './types';

export type OrderField = 'customerName' | 'contactNo' | 'address' | 'city' | 'lines';

export type OrderErrors = Partial<Record<OrderField, string>>;

/** Raw form values as typed by the user. */
export interface RawOrderForm {
  customerName: string;
  contactNo: string;
  address: string;
  city: string;
  terms: OrderTerms;
}

export function validateOrderForm(form: RawOrderForm, lineCount: number): OrderErrors {
  const errors: OrderErrors = {};

  if (lineCount === 0) {
    errors.lines = 'Add at least one product to the order.';
  }

  if (form.customerName.trim().length < 2) {
    errors.customerName = 'Enter the customer name (at least 2 characters).';
  }

  if (form.contactNo.trim() !== '' && !/^[0-9+\-\s()]{7,}$/.test(form.contactNo.trim())) {
    errors.contactNo = 'Enter a valid contact number.';
  }

  if (form.terms === 'COD' && form.address.trim().length < 3) {
    errors.address = 'A delivery address is required for cash on delivery.';
  }
  if (form.terms === 'COD' && form.city.trim().length < 2) {
    errors.city = 'Enter the district or area.';
  }

  return errors;
}
