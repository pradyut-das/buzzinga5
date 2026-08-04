import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBoard } from "@/actions/boards";
import { getTask } from "@/actions/tasks";
import { getContributorsWithStats } from "@/actions/contributors";
import { getTagsWithStats } from "@/actions/tags";
import { canAccessBoard } from "@/lib/secure-board";
import { getCurrentUser } from "@/lib/auth/session";
import { addBoardMember } from "@/lib/auth/membership";
import { BoardHeader } from "@/components/board/board-header";
import { BoardClient } from "@/components/board/board-client";
import { TrackBoardVisit } from "@/components/board/track-board-visit";
import { TaskSidebarHost } from "@/components/task-sidebar/task-sidebar";
import { HydrateBoard } from "@/components/board/hydrate-board";
import { OutboxGuard } from "@/components/board/outbox-guard";
import type { BoardData } from "@/hooks/use-board";
import type { TaskWithComments } from "@/hooks/use-task";

// This page depends on per-request cookies for board authorization.
export const dynamic = "force-dynamic";

interface BoardPageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ task?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ boardId: string }>;
}): Promise<Metadata> {
  const { boardId } = await params;

  // Check if board exists first (without password check)
  const { db } = await import("@/db");
  const { boards } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const boardExists = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });

  if (!boardExists) {
    return { title: "Board Not Found" };
  }

  // Try to get board with password (for title)
  const board = await getBoard(boardId);
  if (!board) {
    // Board exists but password not set - return generic title
    return { title: "Board Locked | Itacorubi Kanban" };
  }

  return {
    title: `${board.title} | Itacorubi Kanban`,
  };
}

export default async function BoardPage({ params, searchParams }: BoardPageProps) {
  const { boardId } = await params;
  const { task: taskId } = await searchParams;

  // Check if board exists first (without password check)
  const { db } = await import("@/db");
  const { boards } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const boardExists = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });

  if (!boardExists) {
    notFound();
  }

  // Check access before fetching board data - must happen before any other async operations
  const allowed = await canAccessBoard(boardId);
  if (!allowed) {
    // No password cookie and not a member - redirect to unlock immediately
    // This must happen before any other operations to prevent rendering
    redirect(`/boards/${boardId}/unlock`);
  }

  // Opening a board you can access while signed in joins it, so it shows up in
  // the sidebar from now on.
  const user = await getCurrentUser();
  if (user) {
    await addBoardMember(boardId, user.id);
  }

  // Now get the board (we know the request has access)
  const board = await getBoard(boardId);

  // This should never happen since we checked access above, but keep as safety check
  if (!board) {
    redirect(`/boards/${boardId}/unlock`);
  }

  const contributorsWithStats = await getContributorsWithStats(boardId);
  const tagsWithStats = await getTagsWithStats(boardId);

  // Fetch task if taskId is provided
  let task = null;
  if (taskId) {
    task = await getTask(taskId);
    // Verify task belongs to this board
    if (task && task.boardId !== boardId) {
      task = null;
    }
  }

  // Cast to types expected by TanStack Query hooks
  const boardData = board as BoardData;
  const taskData = task as TaskWithComments | null;

  return (
    <div
      data-testid="board-page"
      className="flex h-screen flex-col overflow-hidden gradient-holographic"
    >
      <HydrateBoard boardId={board.id} boardData={boardData} taskData={taskData} />
      <OutboxGuard boardId={board.id} />
      <TrackBoardVisit boardId={board.id} title={board.title} />
      <BoardHeader
        boardId={board.id}
        title={board.title}
        contributors={contributorsWithStats}
        tags={tagsWithStats}
      />
      <main className="relative flex-1 overflow-hidden">
        <BoardClient boardId={board.id} />
      </main>
      <TaskSidebarHost
        boardId={board.id}
        columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
        contributors={board.contributors}
        tags={board.tags ?? []}
      />
    </div>
  );
}
