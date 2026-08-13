"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, parseISO } from "date-fns";
import { GripVertical } from "lucide-react";
import Link from "next/link";
import type { BoardColumnView } from "@/lib/agency/queries";

type Task = BoardColumnView["tasks"][number];

function CardSurface({
  task,
  clientId,
  overlay = false,
  dragHandle,
}: {
  task: Task;
  clientId: string;
  overlay?: boolean;
  dragHandle?: React.ReactNode;
}) {
  const assignee = task.assignees[0];

  return (
    <div
      className={`relative w-full rounded-[14px] border bg-white transition-[border-color,box-shadow,transform] duration-150 ${
        overlay
          ? "border-[#c7d7f6] shadow-modal"
          : "border-line shadow-[0_2px_10px_rgba(15,23,42,.025)] hover:-translate-y-px hover:border-[#d8e2f1] hover:shadow-soft"
      }`}
    >
      <Link
        href={`/clients/${clientId}/tasks/${task.id}`}
        draggable={false}
        className="block w-full rounded-[14px] p-4 pr-12 text-left"
        onClick={overlay ? (event) => event.preventDefault() : undefined}
      >
        <div className="text-[15px] font-semibold leading-[1.375rem] text-ink">{task.title}</div>
        {task.category && (
          <span
            className="mt-3 inline-flex rounded-md border-l-[3px] px-2 py-1 text-[11px] font-medium capitalize text-[#475467]"
            style={{
              backgroundColor: `${task.category.color}14`,
              borderLeftColor: task.category.color,
            }}
          >
            {task.category.name}
          </span>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
            {assignee?.initials ?? "—"}
          </span>
          <span>{task.dueAt ? format(parseISO(task.dueAt), "MMM d") : "No date"}</span>
        </div>
      </Link>
      {dragHandle}
    </div>
  );
}

export function BoardCard({
  task,
  clientId,
  dragging,
}: {
  task: Task;
  clientId: string;
  dragging?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: "task" } });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
        opacity: isDragging ? 0.18 : 1,
        zIndex: isDragging ? 1 : undefined,
      }}
      data-kanban-task-id={task.id}
      className="rounded-[14px]"
    >
      <CardSurface
        task={task}
        clientId={clientId}
        overlay={dragging}
        dragHandle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag ${task.title}`}
            className="absolute right-1.5 top-1.5 grid h-11 w-11 cursor-grab touch-none place-items-center rounded-xl text-slate-400 outline-none transition hover:bg-slate-50 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-primary/30 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        }
      />
    </div>
  );
}

export function BoardCardOverlay({ task, clientId }: { task: Task; clientId: string }) {
  return (
    <div className="w-[270px] rotate-[0.6deg] scale-[1.02]">
      <CardSurface task={task} clientId={clientId} overlay />
    </div>
  );
}

export function ColumnDropZone({
  columnId,
  children,
}: {
  columnId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnId,
    data: { type: "column" },
  });

  return (
    <div
      ref={setNodeRef}
      data-kanban-column-id={columnId}
      className={`min-h-24 space-y-3 rounded-xl p-1 transition-[background-color,box-shadow] duration-150 ${
        isOver ? "bg-[#edf4ff] shadow-[inset_0_0_0_1px_rgba(37,99,235,.14)]" : ""
      }`}
    >
      {children}
    </div>
  );
}
