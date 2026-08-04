import { getCurrentUser } from "@/lib/auth/session";
import { getMemberBoards } from "@/lib/auth/membership";
import { BoardSidebarClient } from "./board-sidebar-client";

/**
 * Server shell for the boards sidebar. Only rendered under `/boards`, which
 * requires a session, so there is always a user here.
 */
export async function BoardSidebar() {
  const user = await getCurrentUser();
  if (!user) return null;

  const boards = await getMemberBoards(user.id);

  return <BoardSidebarClient user={user} boards={boards.map(({ id, title }) => ({ id, title }))} />;
}
