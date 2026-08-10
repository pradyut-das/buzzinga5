"use client";

import { BarChart3, LayoutGrid, Plus } from "lucide-react";
import { SquirrlMark } from "@/components/agent/squirrl-mark";
import type { BoardPulse } from "@/lib/agent/stats";

interface SquirrlClientRailProps {
  boards: BoardPulse[];
  activeBoardId: string | null;
  onHome: () => void;
  onOpenBoard: (boardId: string) => void;
  onOpenBoards: () => void;
  onOpenStats: () => void;
  onCreateBoard: () => void;
}

const BOARD_COLOURS = ["blue", "orange", "violet", "green", "rose", "cyan"] as const;

function initials(title: string) {
  const words = title
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "•";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function activityLabel(board: BoardPulse) {
  if (!board.lastActivityAt) return board.open ? "No activity yet" : "Queue clear";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(board.lastActivityAt).getTime()) / (24 * 60 * 60 * 1000)),
  );
  return days === 0 ? "Active today" : `${days}d since activity`;
}

export function SquirrlClientRail({
  boards,
  activeBoardId,
  onHome,
  onOpenBoard,
  onOpenBoards,
  onOpenStats,
  onCreateBoard,
}: SquirrlClientRailProps) {
  const visibleBoards = boards.slice(0, 6);

  return (
    <aside className="squirrl-rail" aria-label="Client boards">
      <button className="squirrl-brand" type="button" onClick={onHome} aria-label="Squirrl home">
        <span className="squirrl-brand-mark">
          <SquirrlMark />
        </span>
        <span className="squirrl-brand-name">Squirrl</span>
      </button>

      <span className="squirrl-rail-label">Client boards</span>
      <nav className="squirrl-client-list" aria-label="Open a client board">
        {visibleBoards.map((board, index) => {
          const health = board.blocked ? "bad" : board.stale || board.unassigned ? "warn" : "good";
          return (
            <button
              key={board.id}
              type="button"
              className="squirrl-client"
              data-active={activeBoardId === board.id}
              onClick={() => onOpenBoard(board.id)}
              title={`${board.title}: ${board.review} awaiting review, ${activityLabel(board)}`}
            >
              <span
                className={`squirrl-client-avatar ${BOARD_COLOURS[index % BOARD_COLOURS.length]}`}
              >
                {initials(board.title)}
              </span>
              <span className="squirrl-client-copy">
                <strong>{board.title}</strong>
                <small>
                  <i className={`squirrl-health ${health}`} />
                  {activityLabel(board)}
                </small>
              </span>
              {board.review > 0 ? (
                <span className="squirrl-review-count">{board.review}</span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {boards.length > visibleBoards.length ? (
        <button type="button" className="squirrl-view-all" onClick={onOpenBoards}>
          View all {boards.length} clients
        </button>
      ) : null}

      {!boards.length ? (
        <button type="button" className="squirrl-empty-client" onClick={onCreateBoard}>
          <Plus aria-hidden />
          <span>Create your first client board</span>
        </button>
      ) : null}

      <nav className="squirrl-rail-tools" aria-label="Agency workspaces">
        <button type="button" onClick={onOpenBoards}>
          <LayoutGrid aria-hidden />
          <span>All work</span>
        </button>
        <button type="button" onClick={onOpenStats}>
          <BarChart3 aria-hidden />
          <span>Agency overview</span>
        </button>
      </nav>
    </aside>
  );
}
