import { isAdminEmail } from "@/lib/auth/admin";
import { getCurrentUser } from "@/lib/auth/session";
import type { UsageSubject } from "@/lib/ai/usage";

/**
 * Who a model call is being made on behalf of.
 *
 * Resolved from the session rather than passed in by the caller, so a ledger
 * row cannot be attributed to the wrong person by a bug at the call site.
 */
export async function currentUsageSubject(): Promise<UsageSubject> {
  const user = await getCurrentUser();
  if (!user) return { userId: null, userEmail: null, isAdmin: false };
  return { userId: user.id, userEmail: user.email, isAdmin: isAdminEmail(user.email) };
}

/** Subject for work with no signed-in user behind it, such as a cron backfill. */
export const SYSTEM_SUBJECT: UsageSubject = {
  userId: null,
  userEmail: "system",
  // System jobs are not admins: the per-user caps do not apply to a null user,
  // but the global caps must still bind a runaway backfill.
  isAdmin: false,
};

export function subjectFromScope(scope: { userId: string; userEmail: string }): UsageSubject {
  return {
    userId: scope.userId,
    userEmail: scope.userEmail,
    isAdmin: isAdminEmail(scope.userEmail),
  };
}
