import { PAYMENT_METHODS, type InventoryItem } from './types';

export type SaleField =
  | 'itemId'
  | 'quantity'
  | 'unitPrice'
  | 'paymentMethod'
  | 'customerName'
  | 'date';

export type SaleErrors = Partial<Record<SaleField, string>>;

/** Raw form values as typed by the user (everything is a string). */
export interface RawSaleForm {
  itemId: string;
  quantity: string;
  unitPrice: string;
  paymentMethod: string;
  customerName: string;
  date: string;
}

export function validateSaleForm(
  form: RawSaleForm,
  item: InventoryItem | undefined,
  today: string,
): SaleErrors {
  const errors: SaleErrors = {};

  if (!form.itemId || !item) {
    errors.itemId = 'Select an item.';
  }

  const quantity = Number(form.quantity);
  if (form.quantity.trim() === '') {
    errors.quantity = 'Quantity is required.';
  } else if (!Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = 'Enter a whole number of at least 1.';
  } else if (item && quantity > item.stock) {
    errors.quantity = `Only ${item.stock} in stock.`;
  }

  const price = Number(form.unitPrice);
  if (form.unitPrice.trim() === '') {
    errors.unitPrice = 'Price is required.';
  } else if (!Number.isFinite(price) || price <= 0) {
    errors.unitPrice = 'Price must be greater than 0.';
  }

  if (!(PAYMENT_METHODS as readonly string[]).includes(form.paymentMethod)) {
    errors.paymentMethod = 'Select a payment method.';
  }

  if (form.customerName.trim().length < 2) {
    errors.customerName = 'Enter the customer name (at least 2 characters).';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    errors.date = 'Select a valid date.';
  } else if (today && form.date > today) {
    errors.date = 'Date cannot be in the future.';
  }

  return errors;
}
