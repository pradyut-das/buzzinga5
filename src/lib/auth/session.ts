import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals, boardMembers, boards, users, type User } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type SessionUser = Pick<User, "id" | "email" | "name">;

/**
 * Supabase Auth owns identity and sessions. The local `users` table is a
 * mirror, keyed by the Supabase user id, because `boards.ownerId`,
 * `boardMembers.userId` and historical decision rows all foreign-key to it.
 *
 * The row is created on first sight rather than by a signup hook, so a user
 * created directly in the Supabase dashboard still works on their first visit.
 */
export async function mirrorUser(id: string, email: string, name: string): Promise<SessionUser> {
  const existing = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, email: true, name: true },
  });

  if (existing) {
    // Keep the mirror in step when the user changes their email or name in
    // Supabase. Comparing first keeps the common path read-only.
    if (existing.email !== email || existing.name !== name) {
      await db.update(users).set({ email, name }).where(eq(users.id, id));
      return { id, email, name };
    }
    return existing;
  }

  // No row under the Supabase id, but the email may already be taken by an
  // account from before the Supabase switch. Adopt it — inserting would fail
  // the unique email constraint, and a new row would strand that person's
  // boards and memberships under their retired id.
  const byEmail = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true },
  });

  if (byEmail) {
    await adoptLegacyUser(byEmail.id, id, email, name);
    return { id, email, name };
  }

  await db.insert(users).values({ id, email, name, createdAt: new Date() });
  return { id, email, name };
}

/**
 * Re-keys a pre-Supabase account onto its Supabase id, carrying its boards and
 * memberships across.
 *
 * Batched so it cannot half-apply: a crash midway would leave the user's
 * boards pointing at an id that no longer exists.
 *
 * The order is forced by two constraints pulling opposite ways. `email` is
 * unique, so the old row must release it before the new row can take it; but
 * the references can only move once the new row exists. Parking the old email
 * behind a throwaway value satisfies both.
 */
async function adoptLegacyUser(
  oldId: string,
  newId: string,
  email: string,
  name: string,
): Promise<void> {
  await db.batch([
    db
      .update(users)
      .set({ email: `migrated-${oldId}@invalid` })
      .where(eq(users.id, oldId)),
    db.insert(users).values({ id: newId, email, name, createdAt: new Date() }),
    db.update(boardMembers).set({ userId: newId }).where(eq(boardMembers.userId, oldId)),
    db.update(boards).set({ ownerId: newId }).where(eq(boards.ownerId, oldId)),
    db.update(approvals).set({ decidedById: newId }).where(eq(approvals.decidedById, oldId)),
    db.delete(users).where(eq(users.id, oldId)),
  ]);
}

/**
 * Returns the signed-in user, or null.
 *
 * Cached per request so layout, page and actions share a single lookup.
 * Uses `getUser()`, not `getSession()`: only `getUser()` revalidates the token
 * against Supabase, so a forged cookie cannot fake a session.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const name = (user.user_metadata?.name as string | undefined)?.trim() || user.email.split("@")[0];

  return mirrorUser(user.id, user.email.toLowerCase(), name);
});

/** Returns the signed-in user or throws. Use in actions that require an account. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not signed in");
  }
  return user;
}
