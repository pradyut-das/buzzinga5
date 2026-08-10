import { TASK_STATUSES, type TaskStatus } from "@/db/schema";

/**
 * The vocabulary of the board. Status is the only fixed list left — what a
 * task *is* comes from the board's own categories (`task_categories`), which
 * people create themselves.
 */

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To do",
  review: "Review",
  accepted: "Accepted",
  rejected: "Rejected",
  in_production: "In production",
  done: "Done",
};

/** Maps a status onto the accent tokens the desk stylesheet already defines. */
export const TASK_STATUS_TONE: Record<TaskStatus, "neutral" | "amber" | "green" | "red" | "blue"> =
  {
    todo: "neutral",
    review: "amber",
    accepted: "green",
    rejected: "red",
    in_production: "blue",
    done: "green",
  };

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export { TASK_STATUSES };
export type { TaskStatus };
