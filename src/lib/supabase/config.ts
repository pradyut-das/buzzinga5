/**
 * The Supabase connection values, read in one place.
 *
 * `NEXT_PUBLIC_*` variables are inlined by Next.js at build time, so they must
 * be referenced as literal `process.env.NEXT_PUBLIC_…` member expressions —
 * routing them through the `validate-env` object would leave the browser
 * bundle with `undefined`. Hence the rule disable here rather than everywhere.
 */

/* oxlint-disable no-process-env */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Server-only. Reading this in a Client Component yields an empty string. */
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

/* oxlint-enable no-process-env */

/** Fails loudly at the call site rather than letting Supabase 401 obscurely. */
export function requireSupabaseConfig(): { url: string; anonKey: string } {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for authentication",
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}
