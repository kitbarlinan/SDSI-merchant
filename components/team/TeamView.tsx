'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Field, inputClass } from '@/components/ui/Field';
import { ROLE_LABEL } from '@/lib/roles';
import { useAppData } from '@/lib/store';
import { BRANCHES, branchName, type Role } from '@/lib/types';

const INVITE_ROLES: Role[] = ['cashier', 'clerk', 'merchant', 'admin'];

/** The admin makes merchants and gives people their login. Each person gets an invitation email to choose a password. */
export function TeamView() {
  const { users, merchants, team } = useAppData();
  const [mName, setMName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branchId, setBranchId] = useState<string>(BRANCHES[0].id);
  const [merchantId, setMerchantId] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function addMerchant() {
    setBusy(true);
    const result = await team!.addMerchant({ name: mName });
    setBusy(false);
    if (!result.ok) return show('bad', result.error);
    setMName('');
    show('ok', `${result.value.name} added. Now give its owner a login below.`);
  }

  async function addUser() {
    setBusy(true);
    const result = await team!.addUser({ name, role, email, ...(role === 'cashier' ? { branchId } : {}), ...(role === 'merchant' ? { merchantId } : {}) });
    setBusy(false);
    if (!result.ok) return show('bad', result.error);
    setName('');
    setEmail('');
    show('ok', `Invitation sent to ${result.value.email}. They choose their password from the email.`);
  }

  async function resend(userId: string, to?: string) {
    setBusy(true);
    const result = await team!.resendInvite(userId);
    setBusy(false);
    show(result.ok ? 'ok' : 'bad', result.ok ? `Invitation sent again to ${to}.` : result.error);
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
        <Card title="Add a merchant" subtitle="A company whose products SDSI fulfills.">
          <form className="flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); void addMerchant(); }}>
            <div className="flex-1">
              <Field label="Merchant name" htmlFor="merchantName">
                <input id="merchantName" value={mName} onChange={(event) => setMName(event.target.value)} className={inputClass(false)} />
              </Field>
            </div>
            <button type="submit" disabled={busy} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-500 disabled:opacity-60">Add</button>
          </form>
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {merchants.map((merchant) => (
              <li key={merchant.id} className="flex items-center gap-2 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: merchant.color }} />
                {merchant.name}
                <span className="ml-auto font-mono text-xs text-slate-400">{merchant.id}</span>
              </li>
            ))}
            {merchants.length === 0 ? <li className="py-2 text-slate-500">No merchants yet.</li> : null}
          </ul>
        </Card>

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
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
