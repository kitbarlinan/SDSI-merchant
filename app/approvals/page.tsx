import { RoleGate } from '@/components/auth/RoleGate';
import { ApprovalsView } from '@/components/approvals/ApprovalsView';

export default function ApprovalsPage() {
  return (
    <RoleGate allow={['admin', 'clerk']}>
      <ApprovalsView />
    </RoleGate>
  );
}
