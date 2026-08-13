import { inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  columns,
  comments,
  contributors,
  taskAssignees,
  tasks,
  type TaskPriority,
} from "@/db/schema";
import type { AgentScope } from "@/lib/agent/scope";
import { plainTextFromContent } from "@/lib/agent/text";

/**
 * Squirrl's dashboard reads a delivery pipeline that has explicit due dates and
 * publish dates. This planner has neither: the pipeline lives in column order,
 * and time lives in `createdAt` plus comment activity. Every metric below is
 * that remapping — same questions, this database's answers.
 */
export type ColumnKind = "backlog" | "active" | "review" | "blocked" | "done" | "archive";

const KIND_PATTERNS: [ColumnKind, RegExp][] = [
  ["archive", /archiv|trash|icebox/i],
  ["done", /done|complete|shipped|sent|closed|live/i],
  ["blocked", /block|hold|stuck|waiting|paused/i],
  ["review", /review|qa|approv|check|feedback/i],
  ["active", /doing|progress|wip|build|design|dev|writing/i],
  ["backlog", /todo|to do|backlog|inbox|idea|new/i],
];

export function classifyColumn(name: string): ColumnKind {
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(name)) return kind;
  }
  return "active";
}

/** A column kind that still owes the team work. */
export function isOpenKind(kind: ColumnKind): boolean {
  return kind !== "done" && kind !== "archive";
}

const STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BoardPulse {
  id: string;
  title: string;
  role: string;
  total: number;
  open: number;
  done: number;
  review: number;
  blocked: number;
  unassigned: number;
  urgent: number;
  stale: number;
  contributors: number;
  completion: number;
  lastActivityAt: string | null;
}

export interface PersonLoad {
  name: string;
  boardTitle: string;
  color: string;
  open: number;
  urgent: number;
}

export interface RiskRow {
  taskId: string;
  boardId: string;
  boardTitle: string;
  title: string;
  columnName: string;
  reason: string;
  priority: TaskPriority;
  ageDays: number;
}

export interface ActivityRow {
  id: string;
  boardId: string;
  boardTitle: string;
  taskTitle: string;
  author: string;
  preview: string;
  createdAt: string;
}

export interface DashboardStats {
  generatedAt: string;
  totals: {
    boards: number;
    tasks: number;
    open: number;
    done: number;
    review: number;
    blocked: number;
    unassigned: number;
    urgent: number;
    stale: number;
    people: number;
    createdToday: number;
    commentsToday: number;
    doneThisWeek: number;
  };
  /** 0–100 weighted delivery health, mirroring the Squirrl health ring. */
  health: { score: number; label: string; drivers: string[] };
  pipeline: { name: string; kind: ColumnKind; count: number }[];
  priorityMix: { priority: TaskPriority; count: number }[];
  velocity: { date: string; created: number; comments: number }[];
  boards: BoardPulse[];
  workload: PersonLoad[];
  risks: RiskRow[];
  activity: ActivityRow[];
  topPriority: string;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function healthLabel(score: number): string {
  if (score >= 85) return "HEALTHY";
  if (score >= 70) return "STEADY";
  if (score >= 50) return "STRAINED";
  return "AT RISK";
}

/**
 * One pass over every board the user belongs to. Kept as a single function so
 * the homepage, the chatbot and the voice agent all quote identical numbers.
 */
export async function getDashboardStats(scope: AgentScope): Promise<DashboardStats> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ids = scope.boardIds;

  if (!ids.length) {
    return {
      generatedAt: now.toISOString(),
      totals: {
        boards: 0,
        tasks: 0,
        open: 0,
        done: 0,
        review: 0,
        blocked: 0,
        unassigned: 0,
        urgent: 0,
        stale: 0,
        people: 0,
        createdToday: 0,
        commentsToday: 0,
        doneThisWeek: 0,
      },
      health: { score: 100, label: "NO WORK", drivers: ["No boards yet"] },
      pipeline: [],
      priorityMix: [],
      velocity: [],
      boards: [],
      workload: [],
      risks: [],
      activity: [],
      topPriority: "Create your first board to start planning.",
    };
  }

  const [columnRows, taskRows, assigneeRows, contributorRows, commentRows] = await Promise.all([
    db.select().from(columns).where(inArray(columns.boardId, ids)),
    db.select().from(tasks).where(inArray(tasks.boardId, ids)),
    db.select().from(taskAssignees),
    db.select().from(contributors).where(inArray(contributors.boardId, ids)),
    db.select().from(comments).where(inArray(comments.boardId, ids)),
  ]);

  const columnById = new Map(columnRows.map((c) => [c.id, c]));
  const boardTitle = new Map(scope.boards.map((b) => [b.id, b.title]));
  const contributorById = new Map(contributorRows.map((c) => [c.id, c]));
  const taskIds = new Set(taskRows.map((t) => t.id));

  const assigneesByTask = new Map<string, string[]>();
  for (const row of assigneeRows) {
    if (!taskIds.has(row.taskId)) continue;
    const list = assigneesByTask.get(row.taskId) ?? [];
    list.push(row.contributorId);
    assigneesByTask.set(row.taskId, list);
  }

  const lastCommentByTask = new Map<string, Date>();
  const commentsByBoard = new Map<string, number>();
  let commentsToday = 0;
  for (const comment of commentRows) {
    const createdAt = comment.createdAt ?? new Date(0);
    const previous = lastCommentByTask.get(comment.taskId);
    if (!previous || createdAt > previous) lastCommentByTask.set(comment.taskId, createdAt);
    commentsByBoard.set(comment.boardId, (commentsByBoard.get(comment.boardId) ?? 0) + 1);
    if (createdAt >= startOfToday) commentsToday += 1;
  }

  const pipeline = new Map<string, { name: string; kind: ColumnKind; count: number }>();
  const priorityMix = new Map<TaskPriority, number>();
  const loadByContributor = new Map<string, { open: number; urgent: number }>();
  const perBoard = new Map<string, BoardPulse>();
  for (const board of scope.boards) {
    perBoard.set(board.id, {
      id: board.id,
      title: board.title,
      role: board.role,
      total: 0,
      open: 0,
      done: 0,
      review: 0,
      blocked: 0,
      unassigned: 0,
      urgent: 0,
      stale: 0,
      contributors: 0,
      completion: 0,
      lastActivityAt: null,
    });
  }
  for (const contributor of contributorRows) {
    const pulse = perBoard.get(contributor.boardId);
    if (pulse) pulse.contributors += 1;
  }

  const risks: RiskRow[] = [];
  const totals = {
    boards: scope.boards.length,
    tasks: 0,
    open: 0,
    done: 0,
    review: 0,
    blocked: 0,
    unassigned: 0,
    urgent: 0,
    stale: 0,
    people: contributorRows.length,
    createdToday: 0,
    commentsToday,
    doneThisWeek: 0,
  };

  for (const task of taskRows) {
    const column = columnById.get(task.columnId);
    const kind = column ? classifyColumn(column.name) : "active";
    const columnName = column?.name ?? "Unknown";
    const pulse = perBoard.get(task.boardId);
    const createdAt = task.createdAt ?? now;
    const lastTouched = lastCommentByTask.get(task.id) ?? createdAt;
    const ageDays = daysBetween(lastTouched, now);
    const assignees = assigneesByTask.get(task.id) ?? [];
    const open = isOpenKind(kind);

    totals.tasks += 1;
    if (pulse) {
      pulse.total += 1;
      if (!pulse.lastActivityAt || new Date(pulse.lastActivityAt) < lastTouched) {
        pulse.lastActivityAt = lastTouched.toISOString();
      }
    }

    const entry = pipeline.get(columnName) ?? { name: columnName, kind, count: 0 };
    entry.count += 1;
    pipeline.set(columnName, entry);
    priorityMix.set(task.priority, (priorityMix.get(task.priority) ?? 0) + 1);

    if (createdAt >= startOfToday) totals.createdToday += 1;
    if (!open && createdAt >= new Date(now.getTime() - 7 * DAY_MS)) totals.doneThisWeek += 1;

    if (open) {
      totals.open += 1;
      if (pulse) pulse.open += 1;
      if (kind === "review") {
        totals.review += 1;
        if (pulse) pulse.review += 1;
      }
      if (kind === "blocked") {
        totals.blocked += 1;
        if (pulse) pulse.blocked += 1;
      }
      if (!assignees.length) {
        totals.unassigned += 1;
        if (pulse) pulse.unassigned += 1;
      }
      if (task.priority === "urgent" || task.priority === "high") {
        totals.urgent += 1;
        if (pulse) pulse.urgent += 1;
      }
      if (ageDays >= STALE_DAYS) {
        totals.stale += 1;
        if (pulse) pulse.stale += 1;
      }

      for (const contributorId of assignees) {
        const load = loadByContributor.get(contributorId) ?? { open: 0, urgent: 0 };
        load.open += 1;
        if (task.priority === "urgent" || task.priority === "high") load.urgent += 1;
        loadByContributor.set(contributorId, load);
      }

      const reason =
        kind === "blocked"
          ? "Sitting in a blocked column"
          : !assignees.length
            ? "No owner assigned"
            : ageDays >= STALE_DAYS
              ? `Untouched for ${ageDays} days`
              : task.priority === "urgent"
                ? "Urgent and still open"
                : "";
      if (reason) {
        risks.push({
          taskId: task.id,
          boardId: task.boardId,
          boardTitle: boardTitle.get(task.boardId) ?? "Board",
          title: task.title,
          columnName,
          reason,
          priority: task.priority,
          ageDays,
        });
      }
    } else {
      totals.done += 1;
      if (pulse) pulse.done += 1;
    }
  }

  for (const pulse of perBoard.values()) {
    pulse.completion = pulse.total ? Math.round((pulse.done / pulse.total) * 100) : 0;
  }

  // Weighted health, same shape as Squirrl's ring: each pressure source can only
  // spend a bounded share of the score, so one bad signal never zeroes it alone.
  const open = Math.max(totals.open, 1);
  const drivers: string[] = [];
  const penalty = (share: number, weight: number, label: string) => {
    const cost = Math.round(Math.min(share, 1) * weight);
    if (cost >= 4) drivers.push(label);
    return cost;
  };
  const score = Math.max(
    0,
    100 -
      penalty(totals.blocked / open, 25, `${totals.blocked} blocked`) -
      penalty(totals.stale / open, 25, `${totals.stale} stale`) -
      penalty(totals.unassigned / open, 20, `${totals.unassigned} unassigned`) -
      penalty(totals.urgent / open, 15, `${totals.urgent} urgent open`) -
      penalty(totals.review / open, 15, `${totals.review} awaiting review`),
  );

  const velocity: { date: string; created: number; comments: number }[] = [];
  for (let index = 13; index >= 0; index -= 1) {
    const dayStart = new Date(startOfToday.getTime() - index * DAY_MS);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    velocity.push({
      date: dayStart.toISOString().slice(0, 10),
      created: taskRows.filter(
        (t) => t.createdAt && t.createdAt >= dayStart && t.createdAt < dayEnd,
      ).length,
      comments: commentRows.filter(
        (c) => c.createdAt && c.createdAt >= dayStart && c.createdAt < dayEnd,
      ).length,
    });
  }

  const workload: PersonLoad[] = [...loadByContributor.entries()]
    .map(([contributorId, load]) => {
      const contributor = contributorById.get(contributorId);
      return {
        name: contributor?.name ?? "Unknown",
        boardTitle: contributor ? (boardTitle.get(contributor.boardId) ?? "Board") : "Board",
        color: contributor?.color ?? "blue",
        open: load.open,
        urgent: load.urgent,
      };
    })
    .sort((a, b) => b.open - a.open || b.urgent - a.urgent)
    .slice(0, 12);

  const activity: ActivityRow[] = commentRows
    .slice()
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
    .slice(0, 12)
    .map((comment) => {
      const task = taskRows.find((t) => t.id === comment.taskId);
      return {
        id: comment.id,
        boardId: comment.boardId,
        boardTitle: boardTitle.get(comment.boardId) ?? "Board",
        taskTitle: task?.title ?? "Deleted task",
        author: contributorById.get(comment.authorId)?.name ?? "Someone",
        preview: plainTextFromContent(comment.content).slice(0, 140),
        createdAt: (comment.createdAt ?? now).toISOString(),
      };
    });

  const topPriority = totals.blocked
    ? `${totals.blocked} ${totals.blocked === 1 ? "task is" : "tasks are"} blocked and need unsticking.`
    : totals.unassigned
      ? `${totals.unassigned} open ${totals.unassigned === 1 ? "task has" : "tasks have"} no owner.`
      : totals.stale
        ? `${totals.stale} open ${totals.stale === 1 ? "task has" : "tasks have"} gone quiet for ${STALE_DAYS}+ days.`
        : totals.review
          ? `${totals.review} ${totals.review === 1 ? "item is" : "items are"} waiting on review.`
          : totals.open
            ? `${totals.open} open ${totals.open === 1 ? "task is" : "tasks are"} moving with nothing flagged.`
            : "Everything on your boards is done.";

  return {
    generatedAt: now.toISOString(),
    totals,
    health: {
      score,
      label: healthLabel(score),
      drivers: drivers.length ? drivers : ["Nothing is dragging delivery"],
    },
    pipeline: [...pipeline.values()].sort((a, b) => b.count - a.count),
    priorityMix: [...priorityMix.entries()]
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => b.count - a.count),
    velocity,
    boards: [...perBoard.values()].sort((a, b) => b.open - a.open),
    workload,
    risks: risks.sort((a, b) => b.ageDays - a.ageDays).slice(0, 20),
    activity,
    topPriority,
  };
}
