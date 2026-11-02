import { productionDb, missingConfig } from './db';
import { clockHk, type Deps } from './service';
import { inviteByEmail } from './supabase';

export const deps: Deps = { invite: inviteByEmail, now: clockHk };
export const database = () => productionDb();
export const configProblem = () => missingConfig();

/** A visitor who is not signed in gets a few tries per hour. Best effort: resets when the server restarts. */
const tries = new Map<string, { count: number; since: number }>();
export function tooMany(key: string, limit = 8, windowMs = 3600_000): boolean {
  const now = Date.now();
  const entry = tries.get(key);
  if (!entry || now - entry.since > windowMs) {
    tries.set(key, { count: 1, since: now });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}
