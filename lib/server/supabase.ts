/** Supabase sign-in checks and invitations. Server only: uses the service role key. */
import { createClient } from '@supabase/supabase-js';
import type { Deps } from './service';
import type { AuthedUser } from './service';

export function authConfigMissing(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 'NEXT_PUBLIC_SUPABASE_URL is not set.';
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.';
  return null;
}

/** Who is calling: checks the sign-in token with Supabase. Null if there is none or it is not valid. */
export async function authenticate(request: Request): Promise<AuthedUser | null> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token || authConfigMissing()) return null;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { authId: data.user.id, email: data.user.email };
}

/** Emails an invitation (through the SMTP set up in Supabase) and returns the new sign-in id. */
export const inviteByEmail: Deps['invite'] = async (email, name, redirectTo) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo });
  if (!error && data.user) return data.user.id;
  // Already has a sign-in (invited before): reuse it.
  if (error && /already|registered|exists/i.test(error.message)) {
    for (let page = 1; page <= 20; page += 1) {
      const list = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const found = list.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      if (found) return found.id;
      if (list.data.users.length < 200) break;
    }
  }
  throw new Error(error?.message ?? 'Invitation failed.');
};

/** Makes the sign-in and an invitation link WITHOUT sending any email, so the admin can pass the link on by hand. */
export const inviteLinkFor: NonNullable<Deps['inviteLink']> = async (email, name, redirectTo) => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let made = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { name }, redirectTo } });
  // Already has a sign-in: a recovery link lets them set a password the same way.
  if (made.error && /already|registered|exists/i.test(made.error.message)) {
    made = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } });
  }
  if (made.error || !made.data?.properties?.action_link || !made.data.user) throw new Error(made.error?.message ?? 'Could not make the link.');
  return { authId: made.data.user.id, link: made.data.properties.action_link };
};
