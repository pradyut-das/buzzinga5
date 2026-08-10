"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getBoard } from "@/actions/boards";
import { getContributorsWithStats } from "@/actions/contributors";
import { getTagsWithStats } from "@/actions/tags";
import { BoardClient } from "@/components/board/board-client";
import { BoardHeader } from "@/components/board/board-header";
import { BoardHostProvider } from "@/components/board/board-host";
import { HydrateBoard } from "@/components/board/hydrate-board";
import { OutboxGuard } from "@/components/board/outbox-guard";
import { TrackBoardVisit } from "@/components/board/track-board-visit";
import { TaskSidebarHost } from "@/components/task-sidebar/task-sidebar";
import type { BoardData } from "@/hooks/use-board";

type ContributorStats = Awaited<ReturnType<typeof getContributorsWithStats>>;
type TagStats = Awaited<ReturnType<typeof getTagsWithStats>>;

interface BoardBundle {
  board: BoardData;
  contributors: ContributorStats;
  tags: TagStats;
}

/**
 * The board, full screen on the creator desk. It renders the same components
 * `/boards/[id]` renders — drag-and-drop client and task sidebar — over the
 * same store hydration, so a board opened from the console behaves exactly
 * like the page and edits land in one cache.
 *
 * The top bar is gone here: its controls ride in a floating button, because
 * the top edge belongs to the desk chrome and the bottom-right corner to the
 * orb. The pane is transparent so the desk background carries through.
 */
export function BoardPane({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const [bundle, setBundle] = useState<BoardBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBundle(null);
    setError(null);

    void (async () => {
      try {
        const [board, contributors, tags] = await Promise.all([
          getBoard(boardId),
          getContributorsWithStats(boardId),
          getTagsWithStats(boardId),
        ]);
        if (!live) return;
        // A locked board needs the unlock page, which only the route can serve.
        if (!board) {
          setError("This board is locked. Open it from its link to unlock it.");
          return;
        }
        setBundle({ board: board as BoardData, contributors, tags });
      } catch {
        if (live) setError("The board did not load. Try again.");
      }
    })();

    return () => {
      live = false;
    };
  }, [boardId]);

  return (
    <BoardHostProvider value={{ embedded: true }}>
      <section
        className="board-pane relative flex flex-col overflow-hidden"
        aria-label={bundle ? `${bundle.board.title} board` : "Board"}
      >
        {!bundle && !error && (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {error}
          </div>
        )}

        {bundle && (
          <>
            <HydrateBoard boardId={bundle.board.id} boardData={bundle.board} />
            <OutboxGuard boardId={bundle.board.id} />
            <TrackBoardVisit boardId={bundle.board.id} title={bundle.board.title} />
            <BoardHeader
              boardId={bundle.board.id}
              title={bundle.board.title}
              contributors={bundle.contributors}
              tags={bundle.tags}
              variant="fab"
              onClose={onClose}
            />
            <main className="relative flex-1 overflow-hidden">
              <BoardClient boardId={bundle.board.id} />
            </main>
            <TaskSidebarHost
              boardId={bundle.board.id}
              columns={bundle.board.columns.map((column) => ({ id: column.id, name: column.name }))}
              contributors={bundle.board.contributors}
              tags={bundle.board.tags ?? []}
            />
          </>
        )}
      </section>
    </BoardHostProvider>
  );
}
