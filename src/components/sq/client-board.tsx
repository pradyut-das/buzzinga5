"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BoardCard, ColumnDropZone } from "@/components/sq/board-card";
import { LiveOrb } from "@/components/sq/live-orb";
import { AgentNote } from "@/components/sq/workspace";
import { createTask, moveTask } from "@/actions/agency";
import { useGeminiLive } from "@/hooks/use-gemini-live";
import type { BoardColumnView } from "@/lib/agency/queries";

/**
 * A client is a board, so this is the client workspace. Cards drag between
 * columns and the move is applied locally first, then written — a dropped card
 * never snaps back while the server catches up. The rail stays put, board
 * actions float bottom-left and the orb bottom-right, so the live voice
 * session survives the whole session.
 */
export function ClientBoard({
  clientId,
  clientName,
  cadence,
  contact,
  columns,
  categories,
  dimmed,
  children,
}: {
  clientId: string;
  clientName: string;
  cadence: string | null;
  contact: string | null;
  columns: BoardColumnView[];
  /** The board's own categories; empty until someone creates one. */
  categories: { id: string; name: string; color: string }[];
  dimmed?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // New work is uncategorized unless the board already has a word for it.
  const [draftCategory, setDraftCategory] = useState("");
  const [board, setBoard] = useState(columns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Server data wins whenever it arrives; the local copy only covers the gap
  // between dropping a card and the refresh landing.
  useEffect(() => setBoard(columns), [columns]);

  const live = useGeminiLive({ onMutation: () => router.refresh() });
  const toggleVoice = useCallback(() => {
    if (live.isLive) live.stop();
    else void live.start();
  }, [live]);

  // 8px of travel before a drag starts, so a plain click still opens the task.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    startTransition(async () => {
      await createTask(clientId, title, 0, draftCategory || null);
      router.refresh();
    });
  };

  const findColumn = (taskId: string) =>
    board.find((column) => column.tasks.some((task) => task.id === taskId));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;

    const from = findColumn(String(active.id));
    // Dropping on a card means "this card's column"; dropping on the column
    // body means the column itself.
    const to = board.find((column) => column.id === over.id) ?? findColumn(String(over.id)) ?? null;
    if (!from || !to || from.id === to.id) return;

    const task = from.tasks.find((entry) => entry.id === active.id);
    if (!task) return;

    setBoard((current) =>
      current.map((column) => {
        if (column.id === from.id) {
          return {
            ...column,
            tasks: column.tasks.filter((entry) => entry.id !== task.id),
          };
        }
        if (column.id === to.id) {
          return { ...column, tasks: [...column.tasks, task] };
        }
        return column;
      }),
    );

    startTransition(async () => {
      try {
        await moveTask(task.id, to.id);
        router.refresh();
      } catch {
        // The write failed, so put the card back where it came from.
        setBoard(columns);
      }
    });
  };

  const activeTask = activeId
    ? board.flatMap((column) => column.tasks).find((task) => task.id === activeId)
    : null;

  return (
    <main className="sq-main">
      <header className="sq-top">
        <span className="sq-crumb">
          {clientName} / Content board{cadence ? ` · ${cadence}` : ""}
        </span>
        <div className="sq-top-actions">
          {contact && <span className="sq-pill">AM · {contact}</span>}
        </div>
      </header>

      <DndContext
        id={`client-board-${clientId}`}
        sensors={sensors}
        collisionDetection={rectIntersection}
        onDragStart={({ active }: DragStartEvent) => setActiveId(String(active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div
          className="sq-board-shell"
          style={dimmed ? { opacity: 0.4, filter: "blur(1px)" } : undefined}
        >
          {board.map((column) => (
            <section key={column.id} className="sq-column">
              <div className="sq-colhead">
                <span>{column.name}</span>
                <span>{column.tasks.length}</span>
              </div>

              {column.name.toLowerCase().includes("to do") && (
                <div className="sq-add-task">
                  <input
                    className="sq-fieldbox"
                    value={draft}
                    placeholder="Add a task…"
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && addTask()}
                  />
                  {categories.length > 0 && (
                    <select
                      className="sq-fieldbox sq-inline-select"
                      aria-label="New task category"
                      value={draftCategory}
                      onChange={(event) => setDraftCategory(event.target.value)}
                    >
                      <option value="">No category</option>
                      {categories.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              <ColumnDropZone columnId={column.id}>
                <SortableContext
                  items={column.tasks.map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {column.tasks.map((task) => (
                    <BoardCard key={task.id} task={task} clientId={clientId} />
                  ))}
                </SortableContext>

                {!column.tasks.length && <p className="sq-sub">Drop a card here.</p>}
              </ColumnDropZone>
            </section>
          ))}
        </div>

        <DragOverlay>
          {activeTask ? <BoardCard task={activeTask} clientId={clientId} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {children}

      {menuOpen && (
        <div
          className="sq-panel sq-section"
          style={{
            position: "absolute",
            left: 24,
            bottom: 84,
            zIndex: 12,
            width: 260,
          }}
        >
          <div className="sq-eyebrow">{clientName}</div>
          <AgentNote>
            Squirrl can create this week’s tasks from the cadence, move approved work to Done, or
            tell you what has gone quiet.
          </AgentNote>
          <div className="sq-followup" style={{ marginTop: 12 }}>
            <Link href="/approvals" className="sq-pill">
              Approvals
            </Link>
            <Link href="/calendar" className="sq-pill">
              Calendar
            </Link>
            <Link href="/studio" className="sq-pill">
              Caption studio
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        className="sq-board-actions"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="Board actions"
      >
        ☷
      </button>

      <LiveOrb
        compact
        state={live.state}
        level={live.inputLevel}
        onToggle={toggleVoice}
        activeTool={live.activeTool}
      />
    </main>
  );
}
