import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { boardMembers, boards, type BoardMemberRole } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export interface MemberBoard {
  id: string;
  title: string;
  role: BoardMemberRole;
}

/** True when the signed-in user is a member of the board. */
export async function isBoardMember(boardId: string, userId: string): Promise<boolean> {
  const membership = await db.query.boardMembers.findFirst({
    where: and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    columns: { role: true },
  });
  return Boolean(membership);
}

/** True when the current request has a signed-in user who is a member of the board. */
export async function currentUserIsBoardMember(boardId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  return isBoardMember(boardId, user.id);
}

/** Idempotently adds a user to a board. Existing memberships keep their role. */
export async function addBoardMember(
  boardId: string,
  userId: string,
  role: BoardMemberRole = "member",
): Promise<void> {
  const existing = await db.query.boardMembers.findFirst({
    where: and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)),
    columns: { role: true },
  });
  if (existing) return;

  await db.insert(boardMembers).values({ boardId, userId, role, createdAt: new Date() });
}

/** Boards the signed-in user is a member of, newest board first. */
export async function getMemberBoards(userId: string): Promise<MemberBoard[]> {
  const rows = await db
    .select({
      id: boards.id,
      title: boards.title,
      role: boardMembers.role,
      createdAt: boards.createdAt,
    })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .where(eq(boardMembers.userId, userId))
    .orderBy(desc(boards.createdAt));

  return rows.map(({ id, title, role }) => ({ id, title, role }));
}
