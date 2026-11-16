// Supabase client for the browser (online builds only). Uses the PUBLIC anon key; all game writes
// go through the `game` Edge Function, and RLS lets a player read only their own rows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL as string, import.meta.env.VITE_SUPABASE_ANON_KEY as string, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
