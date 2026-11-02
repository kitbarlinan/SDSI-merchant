'use client';

import { Field, inputClass } from '@/components/ui/Field';
import { BRANCHES, type BranchId } from '@/lib/types';

/** Which branch handles the order or the pickup. SDSI Sheung Wan is the default. */
export function BranchSelect({
  value,
  onChange,
  label = 'Branch',
  id = 'branch',
}: {
  value: BranchId;
  onChange: (branch: BranchId) => void;
  label?: string;
  id?: string;
}) {
  return (
    <Field label={label} htmlFor={id} hint={BRANCHES.find((branch) => branch.id === value)?.address}>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as BranchId)} className={inputClass(false)}>
        {BRANCHES.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </Field>
  );
}
