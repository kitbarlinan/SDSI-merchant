import { RoleGate } from '@/components/auth/RoleGate';
import { RemittancesView } from '@/components/remittances/RemittancesView';

export default function RemittancesPage() {
  return (
    <RoleGate allow={['admin', 'merchant']}>
      <RemittancesView />
    </RoleGate>
  );
}
