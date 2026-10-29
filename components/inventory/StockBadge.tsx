import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { STOCK_STATUS_LABEL } from '@/lib/inventory';
import type { StockStatus } from '@/lib/types';

const TONE: Record<StockStatus, BadgeTone> = {
  ok: 'green',
  low: 'amber',
  out: 'red',
};

export function StockBadge({ status }: { status: StockStatus }) {
  return (
    <Badge tone={TONE[status]}>
      {status !== 'ok' ? <Icon name="alert" className="h-3 w-3" /> : null}
      {STOCK_STATUS_LABEL[status]}
    </Badge>
  );
}
