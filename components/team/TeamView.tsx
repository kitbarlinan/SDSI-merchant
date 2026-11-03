'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { MerchantsCard } from '@/components/team/MerchantsCard';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Field, inputClass } from '@/components/ui/Field';
import { ROLE_LABEL } from '@/lib/roles';
import { useAuth } from '@/lib/auth';
import { useAppData } from '@/lib/store';
import { BRANCHES, branchName, type Role } from '@/lib/types';

const INVITE_ROLES: Role[] = ['cashier', 'clerk', 'merchant', 'admin'];

/** The admin makes merchants and gives people their login. Each person gets an invitation email to choose a password. */
export function TeamView() {
  const { user: me } = useAuth();
  const { users, merchants, team } = useAppData();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchId, setBranchId] = useState<string>(BRANCHES[0].id);
  const [merchantId, setMerchantId] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (!team) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team & accounts" description="Merchants and logins." />
        <Card>
          <p className="text-sm text-slate-600">Accounts are managed here once the app runs on the real database. In demo mode, use the sample accounts on the sign-in screen.</p>
        </Card>
      </div>
    );
  }

  const show = (tone: 'ok' | 'bad', text: string, warnings?: string[]) => setMessage({ tone: warnings?.length ? 'bad' : tone, text: warnings?.length ? `${text} ${warnings.join(' ')}` : text });

  async function addUser() {
    setBusy(true);
    const result = await team!.addUser({ name, role, email, ...(role === 'cashier' ? { branchId } : {}), ...(role === 'merchant' ? { merchantId } : {}) });
    setBusy(false);
    if (!result.ok) return show('bad', result.error);
    setName('');
    setEmail('');
    if (result.warnings?.length) return show('bad', `${result.value.email} was added, but the invitation email was not sent.`, result.warnings);
    show('ok', `Invitation sent to ${result.value.email}. They choose their password from the email.`);
  }

  async function resend(userId: string, to?: string) {
    setBusy(true);
    const result = await team!.resendInvite(userId);
    setBusy(false);
    if (result.ok && result.warnings?.length) return show('bad', 'The invitation email was not sent.', result.warnings);
    show(result.ok ? 'ok' : 'bad', result.ok ? `Invitation sent again to ${to}.` : result.error);
  }

  async function remove(userId: string, who: string) {
    setBusy(true);
    const result = await team!.deleteUser(userId);
    setBusy(false);
    setConfirmDelete(null);
    show(result.ok ? 'ok' : 'bad', result.ok ? `${who} was deleted.` : result.error);
  }

  const staff = users.filter((user) => user.role !== 'customer');

  return (
    <div className="space-y-6">
      <PageHeader title="Team & accounts" description="Add merchants, then invite cashiers, the clerk and merchant owners by email. Resellers get theirs automatically when the package is delivered." />

      {message ? (
        <p role="status" className={`rounded-xl border p-3 text-sm ${message.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <MerchantsCard onMessage={(tone, text) => setMessage({ tone, text })} />

        <Card title="Invite someone" subtitle="They get an email with a link to choose a password.">
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void addUser(); }}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" htmlFor="inviteName">
                <input id="inviteName" value={name} onChange={(event) => setName(event.target.value)} className={inputClass(false)} />
              </Field>
              <Field label="Email" htmlFor="inviteEmail">
                <input id="inviteEmail" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass(false)} />
              </Field>
              <Field label="Role" htmlFor="inviteRole">
                <select id="inviteRole" value={role} onChange={(event) => setRole(event.target.value as Role)} className={inputClass(false)}>
                  {INVITE_ROLES.map((option) => (
                    <option key={option} value={option}>{ROLE_LABEL[option]}</option>
                  ))}
                </select>
              </Field>
              {role === 'cashier' ? (
                <Field label="Works at" htmlFor="inviteBranch">
                  <select id="inviteBranch" value={branchId} onChange={(event) => setBranchId(event.target.value)} className={inputClass(false)}>
                    {BRANCHES.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {role === 'merchant' ? (
                <Field label="Merchant" htmlFor="inviteMerchant">
                  <select id="inviteMerchant" value={merchantId} onChange={(event) => setMerchantId(event.target.value)} className={inputClass(false)}>
                    <option value="">Choose…</option>
                    {merchants.map((merchant) => (
                      <option key={merchant.id} value={merchant.id}>{merchant.name}</option>
                    ))}
                  </select>
                </Field>
              ) : null}
            </div>
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-60">Send invitation</button>
          </form>
        </Card>
      </div>

      <Card title="People with a login" subtitle="Staff and merchant owners. Resellers are listed under Resellers.">
        <ul className="divide-y divide-slate-100 text-sm">
          {staff.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">
                  {ROLE_LABEL[user.role]}
                  {user.branchId ? ` · ${branchName(user.branchId)}` : ''}
                  {user.merchantId ? ` · ${merchants.find((m) => m.id === user.merchantId)?.name ?? user.merchantId}` : ''}
                  {user.email ? ` · ${user.email}` : ''}
                </p>
              </div>
              <Badge tone={user.hasLogin ? 'green' : 'amber'}>{user.hasLogin ? 'Invitation sent' : 'Invitation not sent'}</Badge>
              {user.email && !user.hasLogin ? (
                <button type="button" disabled={busy} onClick={() => void resend(user.id, user.email)} className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-60">
                  Send invitation again
                </button>
              ) : null}
              {user.id === me?.id ? null : confirmDelete === user.id ? (
                <span className="inline-flex items-center gap-2 text-xs">
                  Delete {user.name}?
                  <button type="button" disabled={busy} onClick={() => void remove(user.id, user.name)} className="font-semibold text-rose-700 underline">Yes, delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="text-slate-600 underline">Cancel</button>
                </span>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(user.id)} className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-60">Delete</button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
