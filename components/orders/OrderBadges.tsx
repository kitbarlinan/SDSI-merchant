import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { STATUS_LABEL, TERMS_LABEL } from '@/lib/orders';
import type { OrderStatus, OrderTerms } from '@/lib/types';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'amber',
  packed: 'sky',
  shipped: 'violet',
  delivered: 'green',
  rts: 'red',
  cancelled: 'slate',
};

const TERMS_TONE: Record<OrderTerms, BadgeTone> = {
  COP: 'slate',
  COD: 'slate',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function TermsBadge({ terms }: { terms: OrderTerms }) {
  return (
    <span title={TERMS_LABEL[terms]}>
      <Badge tone={TERMS_TONE[terms]}>{terms}</Badge>
    </span>
  );
}
