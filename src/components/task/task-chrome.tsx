"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MediaState, TaskStatus } from "@/db/schema";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_TONE } from "@/lib/task-types";
import { setTaskStatus } from "@/actions/task-workspace";

/**
 * The small, shared vocabulary every task uses: the category chip, the status
 * control, and the accept/reject verdict on a piece of media.
 */

/** A board's own category, or nothing when the task is not filed yet. */
export function CategoryChip({ category }: { category: { name: string; color: string } | null }) {
  if (!category) return <span className="sq-type-chip">Uncategorized</span>;
  return (
    <span className="sq-type-chip" style={{ borderColor: category.color }}>
      {category.name}
    </span>
  );
}

export function StatusChip({ status }: { status: TaskStatus }) {
  return (
    <span className={`sq-status-chip tone-${TASK_STATUS_TONE[status]}`}>
      {TASK_STATUS_LABELS[status]}
    </span>
  );
}

/** Status is a flat list: any state can follow any other. */
export function StatusPicker({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Task status"
      className={`sq-status-select tone-${TASK_STATUS_TONE[status]}`}
      value={status}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          await setTaskStatus(taskId, next);
          router.refresh();
        });
      }}
    >
      {TASK_STATUSES.map((option) => (
        <option key={option} value={option}>
          {TASK_STATUS_LABELS[option]}
        </option>
      ))}
    </select>
  );
}

/**
 * Accept or reject one piece of media. Clicking the current verdict again
 * clears it back to pending, so a mis-click is one click to undo.
 */
export function VerdictButtons({
  state,
  disabled,
  onChange,
}: {
  state: MediaState;
  disabled?: boolean;
  onChange: (next: MediaState) => void;
}) {
  return (
    <div className="sq-verdict">
      <button
        type="button"
        className={`sq-tiny${state === "accepted" ? " is-accepted" : ""}`}
        disabled={disabled}
        onClick={() => onChange(state === "accepted" ? "pending" : "accepted")}
      >
        Accept
      </button>
      <button
        type="button"
        className={`sq-tiny${state === "rejected" ? " is-rejected" : ""}`}
        disabled={disabled}
        onClick={() => onChange(state === "rejected" ? "pending" : "rejected")}
      >
        Reject
      </button>
    </div>
  );
}

export function formatTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
