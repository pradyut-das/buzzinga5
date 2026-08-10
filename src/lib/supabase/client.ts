import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/supabase/config";

/**
 * Supabase client for Client Components. Uses the anon key, which is safe to
 * expose — access is governed by Supabase Auth, not by key secrecy.
 */
export function createClient() {
  const { url, anonKey } = requireSupabaseConfig();
  return createBrowserClient(url, anonKey);
}
