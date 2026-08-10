"use client";

import Link from "next/link";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BoardColumnView } from "@/lib/agency/queries";

type Task = BoardColumnView["tasks"][number];

/**
 * A deadline only earns colour once it is close: today and overdue read red,
 * the next three days amber, anything further out stays quiet.
 */
export function DueTag({ due }: { due: string }) {
  const date = new Date(due);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const label =
    days < 0
      ? `${Math.abs(days)}d overdue`
      : days === 0
        ? "Due today"
        : days === 1
          ? "Due tomorrow"
          : `Due ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;

  return (
    <span className={`sq-tag sq-due${days < 0 ? " is-late" : days <= 3 ? " is-soon" : ""}`}>
      {label}
    </span>
  );
}

/**
 * A task card is both a link and a drag handle. The sensor only starts a drag
 * after 8px of movement, so a click still opens the task — the same
 * activation constraint the old board used.
 */
export function BoardCard({
  task,
  clientId,
  dragging,
}: {
  task: Task;
  clientId: string;
  dragging?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      <Link
        href={`/clients/${clientId}/tasks/${task.id}`}
        className="sq-task"
        style={
          dragging ? { boxShadow: "0 18px 40px rgba(20,16,20,.3)", cursor: "grabbing" } : undefined
        }
        draggable={false}
      >
        <b>{task.title}</b>
        <small>
          {task.hasMedia ? "Media · " : ""}
          {task.quietDays}d quiet
        </small>
        <span className="sq-task-foot">
          <span className="sq-card-flags">
            {task.category && (
              <span className="sq-tag" style={{ borderColor: task.category.color }}>
                {task.category.name}
              </span>
            )}
            {task.priority === "high" && <span className="sq-tag">High</span>}
            {task.dueAt && <DueTag due={task.dueAt} />}
          </span>
          <span className="sq-faces">
            {task.assignees.map((person) => (
              <i key={person.name} className="sq-face" title={person.name}>
                {person.initials}
              </i>
            ))}
          </span>
        </span>
      </Link>
    </div>
  );
}

/** The column body is the drop target, so an empty column still accepts a card. */
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
      style={{
        flex: 1,
        minHeight: 80,
        borderRadius: 12,
        outline: isOver ? "1px dashed var(--amber)" : "none",
        outlineOffset: 4,
      }}
    >
      {children}
    </div>
  );
}
