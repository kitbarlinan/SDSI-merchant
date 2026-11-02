/** A safe, plain-words reason for a database failure. Never includes hosts, passwords or keys. */
export function explainFailure(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const message = e?.message ?? '';
  if (code === '42P01' || /app_records.*does not exist|relation .* does not exist/i.test(message))
    return 'The database has no app_records table yet. In Supabase SQL Editor, run supabase/0007_app_records.sql.';
  if (code === '28P01' || /password authentication failed/i.test(message))
    return 'The database refused the password in DATABASE_URL. Check the password (no square brackets) and redeploy.';
  if (/tenant or user not found/i.test(message))
    return 'DATABASE_URL has the wrong project or user. Copy the Transaction pooler string again from Supabase → Connect.';
  if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) || /timeout|getaddrinfo|ECONN/i.test(message))
    return 'The server cannot reach the database. Check DATABASE_URL (use the Transaction pooler string) and redeploy.';
  if (/invalid url|Invalid URL/i.test(message)) return 'DATABASE_URL is not a valid address. If the password has symbols like @ # / :, use letters and numbers only.';
  if (/ssl|certificate/i.test(message)) return 'The database connection failed on SSL. Use the Transaction pooler string from Supabase.';
  return `The server could not load your data (${code || 'error'}). Check the Vercel function logs.`;
}
