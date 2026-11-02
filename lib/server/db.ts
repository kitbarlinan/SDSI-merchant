/**
 * Database access for the server only. Never import this from a component.
 * `Db` is the small surface the app needs, so the same code runs on Postgres (pg) in production
 * and on PGlite in tests.
 */
import { Pool } from 'pg';

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface TxDb extends Db {
  /** Runs fn inside one transaction. Everything is rolled back if fn throws. */
  tx<T>(fn: (q: Db) => Promise<T>): Promise<T>;
}

let pool: Pool | null = null;

export function missingConfig(): string | null {
  if (!process.env.DATABASE_URL) return 'DATABASE_URL is not set.';
  return null;
}

/** The Supabase pooler needs SSL; a local Postgres does not. */
export function productionDb(): TxDb {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      max: 3,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
  }
  const p = pool;
  return {
    query: (sql, params) => p.query(sql, params as unknown[]) as never,
    async tx(fn) {
      const client = await p.connect();
      try {
        await client.query('begin');
        const result = await fn({ query: (sql, params) => client.query(sql, params as unknown[]) as never });
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
