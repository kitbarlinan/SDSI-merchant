'use client';

import { RoleGate } from '@/components/auth/RoleGate';
import { NewOrderForm } from '@/components/orders/NewOrderForm';
import { ResellerOrderForm } from '@/components/orders/ResellerOrderForm';
import { useAuth } from '@/lib/auth';

function Form() {
  const { user } = useAuth();
  return user?.role === 'customer' ? <ResellerOrderForm /> : <NewOrderForm />;
}

export default function NewOrderPage() {
  return (
    <RoleGate allow={['merchant', 'customer']}>
      <Form />
    </RoleGate>
  );
}
