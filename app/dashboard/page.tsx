import { RoleGate } from '@/components/auth/RoleGate';
import { DashboardView } from '@/components/dashboard/DashboardView';

export default function DashboardPage() {
  return (
    <RoleGate allow={['admin', 'merchant']}>
      <DashboardView />
    </RoleGate>
  );
}
