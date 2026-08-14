"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createTask, moveTask } from "@/actions/agency";
import { ModalShell, modalInputClass, modalLabelClass } from "@/components/reference/modal-shell";
import { PageCreateButton } from "@/components/reference/page-create-actions";
import { BoardCard, BoardCardOverlay, ColumnDropZone } from "@/components/sq/board-card";
import type { BoardColumnView } from "@/lib/agency/queries";

const DOTS = ["#94a3b8", "#3b82f6", "#f59e0b", "#38b27b", "#8d6cf7"];

function findColumn(items: BoardColumnView[], taskId: string) {
  return items.find((column) => column.tasks.some((task) => task.id === taskId));
}

export function ClientBoard({
  clientId,
  clientName,
  cadence,
  contact,
  nextDeadline,
  columns,
  categories,
  children,
}: {
  clientId: string;
  clientName: string;
  cadence: string | null;
  contact: string | null;
  nextDeadline?: string | null;
  columns: BoardColumnView[];
  categories: { id: string; name: string; color: string }[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [board, setBoard] = useState(columns);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [pending, startTransition] = useTransition();
  const dragOrigin = useRef<{ board: BoardColumnView[]; columnId: string } | null>(null);
  const boardRef = useRef(board);

  useEffect(() => {
    setBoard(columns);
    boardRef.current = columns;
  }, [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragStart = ({ active }: DragStartEvent) => {
    const taskId = String(active.id);
    const source = findColumn(board, taskId);
    if (!source) return;
    dragOrigin.current = { board, columnId: source.id };
    setActiveId(taskId);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const taskId = String(active.id);
    const overId = String(over.id);

    setBoard((current) => {
      const from = findColumn(current, taskId);
      const to = current.find((column) => column.id === overId) ?? findColumn(current, overId);
      if (!from || !to || from.id === to.id) return current;
      const task = from.tasks.find((entry) => entry.id === taskId);
      if (!task) return current;

      const overIndex = to.tasks.findIndex((entry) => entry.id === overId);
      const insertAt = overIndex >= 0 ? overIndex : to.tasks.length;

      const next = current.map((column) => {
        if (column.id === from.id) {
          return { ...column, tasks: column.tasks.filter((entry) => entry.id !== taskId) };
        }
        if (column.id === to.id) {
          const nextTasks = [...column.tasks];
          nextTasks.splice(insertAt, 0, task);
          return { ...column, tasks: nextTasks };
        }
        return column;
      });
      boardRef.current = next;
      return next;
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    const origin = dragOrigin.current;
    dragOrigin.current = null;
    if (!origin) return;
    if (!over) {
      setBoard(origin.board);
      boardRef.current = origin.board;
      return;
    }
    const destination = findColumn(boardRef.current, String(active.id));
    if (!destination || destination.id === origin.columnId) return;

    startTransition(async () => {
      try {
        await moveTask(String(active.id), destination.id);
        router.refresh();
      } catch (error) {
        setBoard(origin.board);
        boardRef.current = origin.board;
        toast.error(error instanceof Error ? error.message : "Could not move task");
      }
    });
  };

  const onDragCancel = () => {
    if (dragOrigin.current) {
      setBoard(dragOrigin.current.board);
      boardRef.current = dragOrigin.current.board;
    }
    dragOrigin.current = null;
    setActiveId(null);
  };

  const submitTask = () => {
    const title = draft.trim();
    const columnIndex = board.findIndex((column) => column.id === creatingColumnId);
    if (!title || !draftDueDate || columnIndex < 0) return;
    startTransition(async () => {
      await createTask(clientId, title, columnIndex, draftCategory || null, draftDueDate);
      setDraft("");
      setDraftCategory("");
      setDraftDueDate("");
      setCreatingColumnId(null);
      router.refresh();
    });
  };

  const allTasks = board.flatMap((column) => column.tasks);
  const open = board
    .filter((column) => !/done|archive/i.test(column.name))
    .reduce((count, column) => count + column.tasks.length, 0);
  const progress = board
    .filter((column) => /progress|doing|production/i.test(column.name))
    .reduce((count, column) => count + column.tasks.length, 0);
  const review = board
    .filter((column) => /review/i.test(column.name))
    .reduce((count, column) => count + column.tasks.length, 0);
  const activeTask = activeId ? allTasks.find((task) => task.id === activeId) : null;

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col gap-5 pb-6 pt-2 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[38px] font-semibold tracking-[-0.035em]">{clientName}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
            </span>
          </div>
          <p className="mt-1.5 text-[15px] text-muted">
            {cadence ?? "Tasks and deliverables for this client."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              [open, "Open", "#4f8df7"],
              [progress, "In progress", "#f59e0b"],
              [review, "Awaiting review", "#8d6cf7"],
            ].map(([value, label, color]) => (
              <div
                key={String(label)}
                className="flex min-w-[145px] items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: String(color) }}
                />
                <div>
                  <div className="text-[15px] font-semibold">{String(value)}</div>
                  <div className="text-xs text-muted">{String(label)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-full max-w-[250px] flex-col items-end gap-3">
          {board[0] && <PageCreateButton onClick={() => setCreatingColumnId(board[0].id)} />}
          <div className="w-full rounded-[16px] border border-line bg-white px-5 py-4 shadow-soft">
            <div className="text-xs text-muted">Client contact</div>
            <div className="mt-1 text-sm font-semibold">{contact ?? "—"}</div>
            <div className="my-4 h-px bg-line" />
            <div className="text-xs text-muted">Next review</div>
            <div className="mt-1 text-sm font-semibold">{nextDeadline ?? "—"}</div>
          </div>
        </div>
      </div>

      <DndContext
        id={`client-board-${clientId}`}
        sensors={sensors}
        collisionDetection={closestCorners}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        autoScroll={{ acceleration: 12, threshold: { x: 0.12, y: 0.18 } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragCancel={onDragCancel}
        onDragEnd={onDragEnd}
      >
        <div
          role="region"
          className="app-scrollbar flex gap-4 overflow-x-auto pb-3"
          aria-label={`${clientName} Kanban board`}
        >
          {board.map((column, index) => (
            <section
              key={column.id}
              className="min-h-[520px] min-w-[270px] flex-1 rounded-[16px] border border-line bg-[#fcfdfe] p-3"
            >
              <div className="flex items-center gap-2 px-2 py-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: DOTS[index % DOTS.length] }}
                />
                <h2 className="text-[15px] font-semibold text-ink">{column.name}</h2>
                <span className="ml-auto text-xs text-muted">{column.tasks.length}</span>
              </div>
              <ColumnDropZone columnId={column.id}>
                <SortableContext
                  items={column.tasks.map((task) => task.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {column.tasks.map((task) => (
                    <BoardCard key={task.id} task={task} clientId={clientId} />
                  ))}
                </SortableContext>
              </ColumnDropZone>
              <button
                type="button"
                onClick={() => setCreatingColumnId(column.id)}
                className="mt-3 flex w-full items-center gap-2 rounded-xl px-2 py-3 text-sm font-medium text-accent-foreground hover:bg-white"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add task
              </button>
            </section>
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
          {activeTask ? <BoardCardOverlay task={activeTask} clientId={clientId} /> : null}
        </DragOverlay>
      </DndContext>

      {children}

      <ModalShell
        open={Boolean(creatingColumnId)}
        onClose={() => !pending && setCreatingColumnId(null)}
        title="Create task"
        description={`Add work to ${board.find((column) => column.id === creatingColumnId)?.name ?? "this board"}.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreatingColumnId(null)}
              disabled={pending}
              className="h-11 rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !draft.trim() || !draftDueDate}
              onClick={submitTask}
              className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-[#e6a200] disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create task"}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          <label className="block">
            <span className={modalLabelClass}>Task title</span>
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submitTask()}
              className={modalInputClass}
              placeholder="What needs to get done?"
            />
          </label>
          <label className="block">
            <span className={modalLabelClass}>Due date</span>
            <input
              required
              type="date"
              value={draftDueDate}
              onChange={(event) => setDraftDueDate(event.target.value)}
              className={modalInputClass}
            />
          </label>
          {categories.length > 0 && (
            <label className="block">
              <span className={modalLabelClass}>Category</span>
              <select
                value={draftCategory}
                onChange={(event) => setDraftCategory(event.target.value)}
                className={modalInputClass}
              >
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </ModalShell>
    </div>
  );
}
