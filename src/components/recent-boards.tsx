"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkMinus } from "lucide-react";
import { useVisitedBoards, type VisitedBoard } from "@/lib/use-visited-boards";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * `onOpen` lets a host — the creator console — intercept the click and show the
 * board in a dialog instead of navigating. Without it the entries stay links,
 * which is what the signed-out homepage wants.
 */
export function RecentBoards({ onOpen }: { onOpen?: (boardId: string) => void } = {}) {
  const { boards, forget } = useVisitedBoards();
  const [boardToForget, setBoardToForget] = useState<VisitedBoard | null>(null);

  if (boards.length === 0) {
    return null;
  }

  const handleForget = () => {
    if (boardToForget) {
      forget(boardToForget.id);
      setBoardToForget(null);
    }
  };

  return (
    <div className="mx-auto mt-12 max-w-md">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Recent Boards
      </h2>
      <div className="glass-subtle rounded-xl border border-border/50 p-3 shadow-sm">
        <ul className="space-y-2 text-left">
          {boards.map((board) => (
            <li key={board.id} className="group relative">
              <Link
                href="/clients"
                className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-white/60 dark:hover:bg-white/10"
                onClick={
                  onOpen
                    ? (event) => {
                        event.preventDefault();
                        onOpen(board.id);
                      }
                    : undefined
                }
              >
                <span className="text-heading-sm text-foreground">{board.title}</span>
                <code className="text-xs text-muted-foreground/80 transition-opacity group-hover:opacity-0">
                  {board.id.slice(0, 8)}...
                </code>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-1/2 h-7 w-7 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setBoardToForget(board);
                }}
                aria-label={`Forget ${board.title}`}
                title="Forget this board"
              >
                <BookmarkMinus className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <Dialog open={!!boardToForget} onOpenChange={(open) => !open && setBoardToForget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forget Board?</DialogTitle>
            <DialogDescription>
              This will remove &quot;{boardToForget?.title}&quot; from your recent boards list. The
              board itself won&apos;t be deleted — you can access it again with the link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBoardToForget(null)}>
              Cancel
            </Button>
            <Button onClick={handleForget}>Forget</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
