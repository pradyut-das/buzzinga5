import { db } from "@/db";
import { boards } from "@/db/schema";
import { clearBoardPassword, getBoardPassword } from "@/lib/board-password";
import { verifyPassword } from "@/lib/password-hash";
import { isBoardMember } from "@/lib/auth/membership";
import { getCurrentUser } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

export async function getBoardPasswordOptional(boardId: string): Promise<string | null> {
  const password = await getBoardPassword(boardId);
  if (!password) {
    return null;
  }

  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
    columns: { passwordHash: true },
  });

  if (!board?.passwordHash) {
    return null;
  }

  const ok = verifyPassword(password, board.passwordHash);
  if (!ok) {
    await clearBoardPassword(boardId);
    return null;
  }

  return password;
}

export async function requireBoardPassword(boardId: string): Promise<string> {
  const password = await getBoardPasswordOptional(boardId);
  if (!password) {
    throw new Error("Board password missing or invalid");
  }
  return password;
}

/**
 * Board access requires a signed-in user, plus either gate:
 *
 * - board membership, or
 * - a valid board password cookie (which then makes the visitor a member)
 *
 * Signing in is mandatory: a board password alone no longer grants access.
 */
export async function canAccessBoard(boardId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  if (await isBoardMember(boardId, user.id)) return true;

  const password = await getBoardPasswordOptional(boardId);
  return Boolean(password);
}

export async function requireBoardAccess(boardId: string): Promise<void> {
  const allowed = await canAccessBoard(boardId);
  if (!allowed) {
    throw new Error("Board access denied");
  }
}
