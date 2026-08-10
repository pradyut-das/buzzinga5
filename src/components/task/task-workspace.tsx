"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ContributorColor, TaskStatus } from "@/db/schema";
import { TaskDoc } from "@/components/task/task-doc";
import { PeopleRail } from "@/components/task/people-rail";
import { CategoryChip, StatusPicker } from "@/components/task/task-chrome";
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

  return (
    <section className="sq-panel sq-task-workspace">
      <header className="sq-task-head">
        <div className="sq-task-title-block">
          {clientId && (
            <Link href={`/clients/${clientId}`} className="sq-task-back" aria-label="Back to board">
              <ArrowLeft aria-hidden="true" />
            </Link>
          )}

          <div className="sq-task-identity">
            <div className="sq-task-crumbs">
              <CategoryChip category={category} />
            </div>
            <h2>{task.title}</h2>
            <p className="sq-task-summary">
              Shape the brief, review the work, and keep the next decision clear.
            </p>
          </div>
        </div>

        <div className="sq-task-head-actions">
          <div className="sq-task-control">
            <span>Stage</span>
            <StatusPicker taskId={task.id} status={task.status} />
          </div>
          <label className="sq-task-control">
            <span>Due</span>
            <input
              type="date"
              aria-label="Due date"
              className="sq-fieldbox"
              // The input speaks YYYY-MM-DD; the column stores end of that day.
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
      </header>

      <div className="sq-task-body">
        <div className="sq-task-main">
          <TaskDoc
            taskId={task.id}
            doc={task.doc}
            contributors={contributors}
            placeholder="What is this, and what does done look like?"
          />
        </div>

        <aside className="sq-task-rail">
          <PeopleRail
            taskId={task.id}
            contributors={contributors}
            assignees={props.assignees}
            collaborators={props.collaborators}
            stakeholders={props.stakeholders}
            clients={props.clients}
            clientId={clientId}
          />
        </aside>
      </div>
    </section>
  );
}
