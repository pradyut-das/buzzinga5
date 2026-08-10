import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_SERVICE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * Service-role client. Bypasses every access rule, so it must only ever be
 * constructed in server-only code paths that have already authorized the
 * caller — never in a Client Component.
 */
export function createAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required");
  }

  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
