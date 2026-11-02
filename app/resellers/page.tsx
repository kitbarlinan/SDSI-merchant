import { RoleGate } from '@/components/auth/RoleGate';
import { ResellersView } from '@/components/resellers/ResellersView';

export default function ResellersPage() {
  return (
    <RoleGate allow={['admin', 'cashier']}>
      <ResellersView />
    </RoleGate>
  );
}
