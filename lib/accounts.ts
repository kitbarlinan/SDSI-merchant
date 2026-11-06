import type { SentEmail, User } from './types';

/** Short code a reseller shares so new resellers land under them, like "MS-04". */
export function makeRefCode(name: string, userId: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  const number = /(\d+)$/.exec(userId)?.[1] ?? '0';
  return `${initials || 'R'}-${number.padStart(2, '0')}`;
}

/** The code of anyone who invites resellers: a reseller's own code, or one made from the name for staff and others. */
export function refCodeOf(user: User): string {
  if (user.refCode) return user.refCode;
  const base = makeRefCode(user.name, user.id).split('-')[0];
  let hash = 0;
  for (const char of user.id) hash = (hash * 31 + char.charCodeAt(0)) % 46656;
  return `${base}-${hash.toString(36).toUpperCase().padStart(3, '0')}`;
}

/** A readable sign-in name from the email ("maria.santos@x.com" -> "maria.santos"), made unique. */
export function makeUsername(email: string, taken: Set<string>): string {
  const base = (email.split('@')[0] || 'reseller').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24) || 'reseller';
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}${n}`;
  return candidate;
}

/** A temporary password, the same for the same seed so the app stays predictable. Real sign-in lets Supabase Auth make it. */
export function tempPassword(seed: string): string {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  let value = hash;
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[value % alphabet.length];
    value = Math.floor(value / alphabet.length) + Math.imul(i + 7, 2654435761);
    value >>>= 0;
  }
  return `Sdsi-${out}`;
}

export interface NewAccountInput {
  name: string;
  email?: string;
  sponsorId?: string;
}

/**
 * The account of a new reseller. With an email it also gets a temporary username and password, and the email
 * that tells them. They must replace both on first sign-in.
 */
export function provisionReseller(
  users: User[],
  input: NewAccountInput,
  now: string,
  mailSeq: number,
): { user: User; email?: SentEmail } {
  const nextNo = users.reduce((max, user) => Math.max(max, Number(/^usr-c(\d+)$/.exec(user.id)?.[1] ?? 0)), 0) + 1;
  const id = `usr-c${nextNo}`;
  const user: User = { id, name: input.name, role: 'customer', refCode: makeRefCode(input.name, id) };
  if (input.sponsorId) user.sponsorId = input.sponsorId;
  if (!input.email) return { user };
  const username = makeUsername(input.email, new Set(users.map((existing) => existing.username).filter(Boolean) as string[]));
  const password = tempPassword(`${id}|${now}`);
  user.email = input.email;
  user.username = username;
  user.password = password;
  user.mustChange = true;
  return {
    user,
    email: {
      id: `MAIL-${String(mailSeq).padStart(4, '0')}`,
      to: input.email,
      subject: 'Welcome, reseller! Your sign-in details',
      body: [
        `Hi ${input.name},`,
        '',
        'Your reseller package is confirmed. You can now order with your reseller discount.',
        '',
        `Username: ${username}`,
        `Temporary password: ${password}`,
        '',
        'Sign in and you will be asked to choose your own username and password first.',
        `Your referral code is ${user.refCode}. Share it so new resellers land under you.`,
      ].join('\n'),
      createdAt: now,
    },
  };
}

/** Why a new username / password cannot be used, or null. */
export function validateCredentials(users: User[], userId: string, username: string, password: string): string | null {
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) return 'Username: 3 to 30 characters, lowercase letters, numbers, dot, dash or underscore.';
  if (users.some((user) => user.id !== userId && user.username === username)) return 'That username is taken.';
  if (password.length < 8) return 'Password: at least 8 characters.';
  const me = users.find((user) => user.id === userId);
  if (me?.password === password) return 'Choose a different password from the temporary one.';
  return null;
}
