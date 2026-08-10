import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { env } from "@/lib/validate-env";

/**
 * Admins are an env allowlist, not a database flag: the set changes with a
 * deploy, never through the app itself, so a compromised account cannot
 * promote anyone. An unset or empty `ADMIN_EMAILS` means nobody is an admin
 * and `/admin` is closed.
 */
function adminEmails(): string[] {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/** The signed-in user when they are an admin, otherwise null. */
export async function getCurrentAdmin(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || !isAdminEmail(user.email)) return null;
  return user;
}

/** Use at the top of every admin action and page. Throws for everyone else. */
export async function requireAdmin(): Promise<SessionUser> {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error("Admins only");
  return admin;
}
