import { RoleGate } from '@/components/auth/RoleGate';
import { NewOrderForm } from '@/components/orders/NewOrderForm';

export default function NewOrderPage() {
  return (
    <RoleGate allow={['merchant']}>
      <NewOrderForm />
    </RoleGate>
  );
}
