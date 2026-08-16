import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contributors, CONTRIBUTOR_COLORS, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * The bridge between an account and the board-local person rows that
 * notifications are keyed on. Notifications address contributors, not users, so
 * anything that wants to record "who did this" has to cross here first.
 */

/**
 * This board's contributor row for the given account, or undefined when the
 * account has never been staffed here.
 *
 * Look-up only. Attribution must never conjure a person onto a board — reading
 * a task should not add you to its roster. Use `resolveContributorForUser` when
 * the write genuinely puts someone on the board.
 */
export async function contributorIdForUser(
  boardId: string,
  userId: string,
): Promise<string | undefined> {
  const row = await db.query.contributors.findFirst({
    where: and(eq(contributors.boardId, boardId), eq(contributors.userId, userId)),
    columns: { id: true },
  });
  return row?.id;
}

/**
 * The signed-in person as a contributor of this board, for use as
 * `triggeredById`. Undefined when signed out or not yet staffed here — callers
 * pass it straight through, and the digest falls back to "Someone".
 */
export async function currentContributorId(boardId: string): Promise<string | undefined> {
  const user = await getCurrentUser();
  if (!user) return undefined;
  return contributorIdForUser(boardId, user.id);
}

/**
 * Turns an account into this board's contributor, reusing the row if the
 * account has worked here before. Colour is assigned round-robin so a new face
 * is visually distinct without asking anyone to choose.
 */
export async function resolveContributorForUser(boardId: string, userId: string): Promise<string> {
  const existing = await contributorIdForUser(boardId, userId);
  if (existing) return existing;

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new Error("That account no longer exists");

  const onBoard = await db.query.contributors.findMany({
    where: eq(contributors.boardId, boardId),
    columns: { id: true },
  });
  const id = randomUUID();
  await db.insert(contributors).values({
    id,
    boardId,
    userId,
    name: user.name,
    email: user.email,
    color: CONTRIBUTOR_COLORS[onBoard.length % CONTRIBUTOR_COLORS.length],
  });
  return id;
}
