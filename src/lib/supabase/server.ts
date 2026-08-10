import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "@/lib/supabase/config";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Always create a fresh client per request — Next.js caches modules across
 * requests, so a shared instance would leak one user's session into another's.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where the cookie store is
          // read-only. Middleware refreshes the session, so this is safe.
        }
      },
    },
  });
}
