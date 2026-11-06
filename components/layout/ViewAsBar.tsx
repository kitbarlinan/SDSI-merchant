'use client';

import { useAuth } from '@/lib/auth';
import { useAppData } from '@/lib/store';

const ROLE: Record<string, string> = { admin: 'Admin', cashier: 'Cashier', clerk: 'Inventory clerk', merchant: 'Merchant', customer: 'Reseller' };

/** Admin only: pick a person and see exactly what they see. Read-only; a banner shows while it is on. */
export function ViewAsBar() {
  const { realUser, viewingAs, viewAs } = useAuth();
  const { users } = useAppData();
  if (viewingAs) {
    return (
      <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-950">
        <span>
          Viewing as <strong>{viewingAs.name}</strong> ({ROLE[viewingAs.role] ?? viewingAs.role}) · read-only, no changes can be made
        </span>
        <button type="button" onClick={() => viewAs(null)} className="rounded-lg bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50">
          Exit
        </button>
      </div>
    );
  }
  if (!realUser || realUser.role !== 'admin') return null;
  const others = users.filter((candidate) => candidate.id !== realUser.id);
  if (others.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
      <label className="flex items-center gap-2">
        View as
        <select
          value=""
          onChange={(event) => event.target.value && viewAs(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
        >
          <option value="">Pick a person…</option>
          {others.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({ROLE[candidate.role] ?? candidate.role})
            </option>
          ))}
        </select>
      </label>
      <span>See exactly what they see (read-only).</span>
    </div>
  );
}
