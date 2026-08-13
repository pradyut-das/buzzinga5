"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContributorColor, TaskStatus } from "@/db/schema";
import { ModalShell } from "@/components/reference/modal-shell";
import { TaskDoc } from "@/components/task/task-doc";
import { PeopleRail } from "@/components/task/people-rail";
import { StatusPicker } from "@/components/task/task-chrome";
import { setTaskCategory } from "@/actions/task-workspace";
import { setTaskDueDate } from "@/actions/agency";

export interface TaskCategoryOption {
  id: string;
  name: string;
  color: string;
}

export interface TaskWorkspaceProps {
  task: {
    id: string;
    boardId: string;
    title: string;
    status: TaskStatus;
    doc: string | null;
    /** ISO timestamp, or null when nothing is due. */
    dueAt: string | null;
  };
  /** The board's own categories, and the one this task is filed under. */
  categories: TaskCategoryOption[];
  category: TaskCategoryOption | null;
  clientId: string | null;
  clients: { id: string; name: string }[];
  contributors: { id: string; name: string; color: ContributorColor }[];
  assignees: { id: string; name: string }[];
  collaborators: { id: string; name: string }[];
  stakeholders: { id: string; name: string }[];
}

/**
 * One screen for every task: the brief, the people, the stage and the board's
 * own category. There are no per-kind workspaces — a task is what its board
 * says it is, not what a built-in type list allows.
 */
export function TaskWorkspace(props: TaskWorkspaceProps) {
  const { task, category, categories, clientId, contributors } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const close = () => {
    if (clientId) router.push(`/clients/${clientId}`);
    else router.back();
  };

  return (
    <ModalShell
      open
      onClose={close}
      title={task.title}
      description="Shape the brief, review the work, and keep the next decision clear."
      footer={
        <button
          type="button"
          onClick={close}
          className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#185be0]"
        >
          Done
        </button>
      }
    >
      <div className="sq ref-task-details">
        <div className="ref-task-details-controls">
          <div className="sq-task-control">
            <span>Stage</span>
            <StatusPicker taskId={task.id} status={task.status} />
          </div>
          <label className="sq-task-control">
            <span>Due date</span>
            <input
              type="date"
              aria-label="Due date"
              className="sq-fieldbox"
              value={task.dueAt ? task.dueAt.slice(0, 10) : ""}
              disabled={pending}
              onChange={(event) => {
                const next = event.target.value || null;
                startTransition(async () => {
                  await setTaskDueDate(task.id, next);
                  router.refresh();
                });
              }}
            />
          </label>
          <label className="sq-task-control">
            <span>Category</span>
            <select
              aria-label="Task category"
              className="sq-fieldbox sq-inline-select"
              value={category?.id ?? ""}
              disabled={pending}
              onChange={(event) => {
                const next = event.target.value || null;
                startTransition(async () => {
                  await setTaskCategory(task.id, next);
                  router.refresh();
                });
              }}
            >
              <option value="">No category</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <TaskDoc
          taskId={task.id}
          doc={task.doc}
          contributors={contributors}
          placeholder="What is this, and what does done look like?"
        />

        <div className="ref-task-details-people">
          <PeopleRail
            taskId={task.id}
            contributors={contributors}
            assignees={props.assignees}
            collaborators={props.collaborators}
            stakeholders={props.stakeholders}
            clients={props.clients}
            clientId={clientId}
          />
        </div>
      </div>
    </ModalShell>
  );
}
