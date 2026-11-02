'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** The browser's Supabase client. Uses only the public URL and the anon (publishable) key. */
export function browserClient(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://supabase-not-configured.invalid', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'not-configured', {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return client;
}
