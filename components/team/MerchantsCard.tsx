'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Field, inputClass } from '@/components/ui/Field';
import { useAppData, type MerchantInput } from '@/lib/store';
import type { Merchant } from '@/lib/types';

const EMPTY: Required<MerchantInput> = { name: '', ownerName: '', bankName: '', bankAccountName: '', bankAccountNo: '' };

const mask = (no: string) => (no.length > 4 ? `••••${no.replace(/\D/g, '').slice(-4)}` : no);

const formOf = (merchant: Merchant): Required<MerchantInput> => ({
  name: merchant.name,
  ownerName: merchant.profile?.ownerName ?? '',
  bankName: merchant.profile?.bankName ?? '',
  bankAccountName: merchant.profile?.bankAccountName ?? '',
  bankAccountNo: merchant.profile?.bankAccountNo ?? '',
});

/** Merchants: add, edit the owner and the bank account TheYellowBasket remits to, and delete one that was added by mistake. */
export function MerchantsCard({ onMessage }: { onMessage: (tone: 'ok' | 'bad', text: string) => void }) {
  const { merchants, team } = useAppData();
  const [form, setForm] = useState<Required<MerchantInput>>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!team) return null;

  const set = (key: keyof MerchantInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
    setOpen(false);
  };

  async function save() {
    setBusy(true);
    const result = editing ? await team!.updateMerchant({ ...form, id: editing }) : await team!.addMerchant(form);
    setBusy(false);
    if (!result.ok) return onMessage('bad', result.error);
    onMessage('ok', editing ? `${result.value.name} updated.` : `${result.value.name} added. Now invite its owner under "Invite someone".`);
    reset();
  }

  async function remove(merchant: Merchant) {
    setBusy(true);
    const result = await team!.deleteMerchant(merchant.id);
    setBusy(false);
    setConfirmDelete(null);
    onMessage(result.ok ? 'ok' : 'bad', result.ok ? `${merchant.name} deleted.` : result.error);
  }

  const btn = 'rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60';

  return (
    <Card
      className="lg:col-span-2"
      title="Merchants"
      subtitle="Companies whose products TheYellowBasket fulfills, and where their payout is remitted."
      action={
        !open ? (
          <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-emerald-600 text-emerald-950 hover:bg-emerald-500`}>
            Add a merchant
          </button>
        ) : null
      }
    >
      {open ? (
        <form
          className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <p className="text-sm font-semibold text-slate-900">{editing ? 'Edit merchant' : 'New merchant'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Merchant (company) name" htmlFor="merchantName">
              <input id="merchantName" value={form.name} onChange={(event) => set('name', event.target.value)} className={inputClass(false)} />
            </Field>
            <Field label="Owner's name" htmlFor="merchantOwner">
              <input id="merchantOwner" value={form.ownerName} onChange={(event) => set('ownerName', event.target.value)} className={inputClass(false)} />
            </Field>
          </div>
          <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Where we remit their payout</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bank" htmlFor="merchantBank">
              <input id="merchantBank" value={form.bankName} onChange={(event) => set('bankName', event.target.value)} placeholder="e.g. BDO" className={inputClass(false)} />
            </Field>
            <Field label="Account name" htmlFor="merchantAccountName">
              <input id="merchantAccountName" value={form.bankAccountName} onChange={(event) => set('bankAccountName', event.target.value)} className={inputClass(false)} />
            </Field>
            <Field label="Account number" htmlFor="merchantAccountNo">
              <input id="merchantAccountNo" inputMode="numeric" value={form.bankAccountNo} onChange={(event) => set('bankAccountNo', event.target.value)} className={inputClass(false)} />
            </Field>
          </div>
          <p className="text-xs text-slate-500">Seen only by you, the cashier who releases payouts, and this merchant. Bank details can be added later.</p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={`${btn} bg-emerald-600 text-emerald-950 hover:bg-emerald-500`}>
              {editing ? 'Save changes' : 'Add merchant'}
            </button>
            <button type="button" onClick={reset} className={`${btn} border border-slate-300 text-slate-700 hover:bg-white`}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <ul className="divide-y divide-slate-100 text-sm">
        {merchants.map((merchant) => {
          const profile = merchant.profile;
          return (
            <li key={merchant.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: merchant.color }} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">
                  {merchant.name} <span className="font-mono text-xs font-normal text-slate-400">{merchant.id}</span>
                </p>
                <p className="text-xs text-slate-500">
                  {profile?.ownerName ? `Owner: ${profile.ownerName}` : 'No owner name yet'}
                  {profile ? ` · ${profile.bankName} · ${profile.bankAccountName} · ${mask(profile.bankAccountNo)}` : ''}
                </p>
                {!profile?.bankAccountNo ? <p className="text-xs text-amber-700">No bank account yet, so payouts have nowhere to be remitted.</p> : null}
              </div>
              {confirmDelete === merchant.id ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-rose-700">Delete {merchant.name}?</span>
                  <button type="button" disabled={busy} onClick={() => void remove(merchant)} className="font-semibold text-rose-700 hover:underline">
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="text-slate-500 hover:underline">
                    Cancel
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setForm(formOf(merchant));
                      setEditing(merchant.id);
                      setOpen(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-emerald-700 hover:underline"
                  >
                    Edit
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(merchant.id)} className="text-rose-700 hover:underline">
                    Delete
                  </button>
                </span>
              )}
            </li>
          );
        })}
        {merchants.length === 0 ? <li className="py-2 text-slate-500">No merchants yet. Add the first one.</li> : null}
      </ul>
    </Card>
  );
}
