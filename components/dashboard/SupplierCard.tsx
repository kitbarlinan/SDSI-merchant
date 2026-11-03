'use client';

import { useMemo } from 'react';
import { BarList } from '@/components/charts/BarList';
import { Card } from '@/components/ui/Card';
import { formatCurrency, formatNumber } from '@/lib/format';
import { NO_SUPPLIER, salesBySupplier } from '@/lib/suppliers';
import { useAppData } from '@/lib/store';
import type { SaleLine } from '@/lib/types';

/** Which supplier's products sold best on the selected dates. Set the supplier on each product in Inventory → Master list. */
export function SupplierCard({ sales, showMerchant }: { sales: SaleLine[]; showMerchant?: boolean }) {
  const { items, products, merchants } = useAppData();
  const rows = useMemo(() => salesBySupplier(sales, items, products), [sales, items, products]);
  const known = rows.some((row) => row.supplier !== NO_SUPPLIER);
  return (
    <Card
      title="Sales by supplier"
      subtitle={known || rows.length === 0 ? 'Net SRP of the products sold, by who supplies them. Selected dates.' : 'No supplier is set on the products yet. Add one in Inventory → Master list.'}
    >
      <BarList
        items={rows.map((row) => {
          const merchant = merchants.find((candidate) => candidate.id === row.merchantId);
          return {
            key: `${row.merchantId}|${row.supplier}`,
            label: showMerchant && merchant ? `${row.supplier} · ${merchant.name}` : row.supplier,
            sublabel: `${formatNumber(row.units)} pieces`,
            value: row.revenue,
            display: formatCurrency(row.revenue),
            color: merchant?.color,
          };
        })}
        emptyText="No sales on these dates."
      />
    </Card>
  );
}
