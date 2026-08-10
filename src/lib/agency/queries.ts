import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  approvals,
  assets,
  boards,
  captionDrafts,
  clients,
  columns,
  comments,
  communities,
  broadcasts,
  contributors,
  integrationSyncs,
  reviewNotes,
  scheduledPosts,
  tasks,
  taskAssignees,
  taskCategories,
  taskCollaborators,
  taskStakeholders,
  topics,
  type ApprovalState,
  type AssetKind,
  type AssetSlide,
  type TaskStatus,
} from "@/db/schema";

/**
 * Read models for the agency screens. Every screen reads through this module
 * so the rail, the homepage and the agent all quote the same numbers.
 */

const DAY_MS = 86_400_000;

export interface ClientSummary {
  id: string;
  name: string;
  initials: string;
  color: string;
  boardId: string | null;
  pendingApprovals: number;
  openTasks: number;
  health: "good" | "watch" | "risk";
  nextDeadlineAt: Date | null;
}

export async function listClients(): Promise<ClientSummary[]> {
  const rows = await db.query.clients.findMany({
    where: isNull(clients.archivedAt),
    orderBy: [asc(clients.name)],
  });
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [boardRows, approvalRows, taskRows] = await Promise.all([
    db.select().from(boards).where(inArray(boards.clientId, ids)),
    db
      .select({ clientId: approvals.clientId, id: approvals.id, createdAt: approvals.createdAt })
      .from(approvals)
      .where(and(inArray(approvals.clientId, ids), eq(approvals.state, "pending"))),
    db
      .select({ boardId: tasks.boardId, columnId: tasks.columnId })
      .from(tasks)
      .where(
        inArray(
          tasks.boardId,
          (
            await db.select({ id: boards.id }).from(boards).where(inArray(boards.clientId, ids))
          ).map((b) => b.id),
        ),
      ),
  ]);

  const doneColumns = new Set(
    (await db.select().from(columns))
      .filter((column) => /done|archive/i.test(column.name))
      .map((column) => column.id),
  );

  return rows.map((client) => {
    const board = boardRows.find((row) => row.clientId === client.id) ?? null;
    const pending = approvalRows.filter((row) => row.clientId === client.id);
    const openTasks = board
      ? taskRows.filter((row) => row.boardId === board.id && !doneColumns.has(row.columnId)).length
      : 0;

    // Health is the queue, not a guess: anything aging past a day is a risk.
    const oldest = pending.reduce<number>((max, row) => {
      const age = row.createdAt ? Date.now() - row.createdAt.getTime() : 0;
      return Math.max(max, age);
    }, 0);
    const health = oldest > DAY_MS ? "risk" : pending.length > 2 ? "watch" : "good";

    return {
      id: client.id,
      name: client.name,
      initials: client.initials,
      color: client.color,
      boardId: board?.id ?? null,
      pendingApprovals: pending.length,
      openTasks,
      health,
      nextDeadlineAt: client.nextDeadlineAt ?? null,
    };
  });
}

export interface ApprovalCard {
  id: string;
  assetId: string;
  clientId: string;
  clientName: string;
  clientColor: string;
  title: string;
  kind: AssetKind;
  accent: string | null;
  thumbnailUrl: string | null;
  blobUrl: string | null;
  slideCount: number | null;
  durationSeconds: number | null;
  body: string | null;
  reason: string | null;
  state: ApprovalState;
  ageLabel: string;
  createdAt: Date | null;
}

function ageLabel(from: Date | null): string {
  if (!from) return "just now";
  const minutes = Math.max(1, Math.round((Date.now() - from.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days}d`;
}

export async function listApprovals(state: ApprovalState = "pending"): Promise<ApprovalCard[]> {
  const rows = await db
    .select({ approval: approvals, asset: assets, client: clients })
    .from(approvals)
    .innerJoin(assets, eq(approvals.assetId, assets.id))
    .innerJoin(clients, eq(approvals.clientId, clients.id))
    .where(eq(approvals.state, state))
    .orderBy(asc(approvals.createdAt));

  return rows.map(({ approval, asset, client }) => ({
    id: approval.id,
    assetId: asset.id,
    clientId: client.id,
    clientName: client.name,
    clientColor: client.color,
    title: asset.title,
    kind: asset.kind,
    accent: asset.accent,
    thumbnailUrl: asset.thumbnailUrl,
    blobUrl: asset.blobUrl,
    slideCount: asset.slideCount,
    durationSeconds: asset.durationSeconds,
    body: asset.body,
    reason: approval.reason,
    state: approval.state,
    ageLabel: ageLabel(approval.createdAt ?? null),
    createdAt: approval.createdAt ?? null,
  }));
}

export async function getApproval(approvalId: string) {
  const row = await db
    .select({ approval: approvals, asset: assets, client: clients })
    .from(approvals)
    .innerJoin(assets, eq(approvals.assetId, assets.id))
    .innerJoin(clients, eq(approvals.clientId, clients.id))
    .where(eq(approvals.id, approvalId))
    .get();
  if (!row) return null;

  const notes = await db.query.reviewNotes.findMany({
    where: eq(reviewNotes.approvalId, approvalId),
    orderBy: [desc(reviewNotes.createdAt)],
  });

  return { ...row, notes, ageLabel: ageLabel(row.approval.createdAt ?? null) };
}

export interface BoardColumnView {
  id: string;
  name: string;
  tasks: {
    id: string;
    title: string;
    priority: string;
    /** ISO timestamp, or null when the task is scheduled by column order alone. */
    dueAt: string | null;
    quietDays: number;
    assignees: { name: string; initials: string }[];
    /** The board category this task was filed under, or null. */
    category: { id: string; name: string; color: string } | null;
    status: TaskStatus;
    hasMedia: boolean;
  }[];
}

export async function getClientBoard(clientId: string) {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) return null;

  const board = await db.query.boards.findFirst({ where: eq(boards.clientId, clientId) });
  if (!board) {
    return {
      client,
      board: null,
      columns: [] as BoardColumnView[],
      categories: [] as (typeof taskCategories.$inferSelect)[],
    };
  }

  const [columnRows, taskRows, assigneeRows, contributorRows, assetRows, categoryRows] =
    await Promise.all([
      db.query.columns.findMany({
        where: eq(columns.boardId, board.id),
        orderBy: [asc(columns.position)],
      }),
      db.query.tasks.findMany({
        where: eq(tasks.boardId, board.id),
        orderBy: [asc(tasks.position)],
      }),
      db.select().from(taskAssignees),
      db.query.contributors.findMany({ where: eq(contributors.boardId, board.id) }),
      db.query.assets.findMany({ where: eq(assets.clientId, clientId) }),
      db.query.taskCategories.findMany({
        where: eq(taskCategories.boardId, board.id),
        orderBy: [asc(taskCategories.position), asc(taskCategories.name)],
      }),
    ]);

  const byId = new Map(contributorRows.map((row) => [row.id, row]));

  const columnViews: BoardColumnView[] = columnRows.map((column) => ({
    id: column.id,
    name: column.name,
    tasks: taskRows
      .filter((task) => task.columnId === column.id)
      .map((task) => {
        const names = assigneeRows
          .filter((row) => row.taskId === task.id)
          .map((row) => byId.get(row.contributorId))
          .filter(Boolean)
          .map((row) => ({
            name: row!.name,
            initials: row!.name
              .split(/\s+/)
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
          }));
        const asset = assetRows.find((row) => row.taskId === task.id);
        const quietDays = task.createdAt
          ? Math.max(0, Math.round((Date.now() - task.createdAt.getTime()) / DAY_MS))
          : 0;
        return {
          id: task.id,
          title: task.title,
          priority: task.priority,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
          quietDays,
          assignees: names,
          category: categoryRows.find((row) => row.id === task.categoryId) ?? null,
          status: task.status,
          hasMedia: Boolean(asset),
        };
      }),
  }));

  return { client, board, columns: columnViews, categories: categoryRows };
}

export async function getTaskDetail(taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return null;

  const board = await db.query.boards.findFirst({ where: eq(boards.id, task.boardId) });
  const client = board?.clientId
    ? await db.query.clients.findFirst({ where: eq(clients.id, board.clientId) })
    : null;

  const [commentRows, contributorRows, assigneeRows, columnRows, assetRows, draftRows] =
    await Promise.all([
      db.query.comments.findMany({
        where: eq(comments.taskId, taskId),
        orderBy: [desc(comments.createdAt)],
      }),
      db.query.contributors.findMany({ where: eq(contributors.boardId, task.boardId) }),
      db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId)),
      db.query.columns.findMany({
        where: eq(columns.boardId, task.boardId),
        orderBy: [asc(columns.position)],
      }),
      db.query.assets.findMany({ where: eq(assets.taskId, taskId) }),
      db.query.captionDrafts.findMany({
        where: eq(captionDrafts.taskId, taskId),
        orderBy: [desc(captionDrafts.createdAt)],
      }),
    ]);

  const byId = new Map(contributorRows.map((row) => [row.id, row]));

  return {
    task,
    client,
    columns: columnRows,
    column: columnRows.find((column) => column.id === task.columnId) ?? null,
    comments: commentRows.map((comment) => ({
      ...comment,
      authorName: byId.get(comment.authorId)?.name ?? "Someone",
    })),
    assignees: assigneeRows.map((row) => byId.get(row.contributorId)?.name).filter(Boolean),
    asset: assetRows[0] ?? null,
    draft: draftRows[0] ?? null,
  };
}

/**
 * Everything one task workspace renders: the task's own facts, the three sets
 * of people, every asset it produced with its review notes, and the CTA that
 * hangs off it. One query so the screens never disagree about a verdict.
 */
export async function getTaskWorkspace(taskId: string) {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) return null;

  const board = await db.query.boards.findFirst({ where: eq(boards.id, task.boardId) });
  const clientId = task.clientId ?? board?.clientId ?? null;

  const [
    contributorRows,
    assigneeRows,
    collaboratorRows,
    stakeholderRows,
    assetRows,
    commentRows,
    clientRows,
    categoryRows,
  ] = await Promise.all([
    db.query.contributors.findMany({ where: eq(contributors.boardId, task.boardId) }),
    db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId)),
    db.select().from(taskCollaborators).where(eq(taskCollaborators.taskId, taskId)),
    db.select().from(taskStakeholders).where(eq(taskStakeholders.taskId, taskId)),
    db.query.assets.findMany({
      where: eq(assets.taskId, taskId),
      orderBy: [asc(assets.createdAt)],
    }),
    db.query.comments.findMany({
      where: eq(comments.taskId, taskId),
      orderBy: [desc(comments.createdAt)],
    }),
    db.query.clients.findMany({ where: isNull(clients.archivedAt), orderBy: [asc(clients.name)] }),
    db.query.taskCategories.findMany({
      where: eq(taskCategories.boardId, task.boardId),
      orderBy: [asc(taskCategories.position), asc(taskCategories.name)],
    }),
  ]);

  const noteRows = assetRows.length
    ? await db.query.reviewNotes.findMany({
        where: inArray(
          reviewNotes.assetId,
          assetRows.map((asset) => asset.id),
        ),
        orderBy: [asc(reviewNotes.createdAt)],
      })
    : [];

  const byId = new Map(contributorRows.map((row) => [row.id, row]));
  const people = (rows: { contributorId: string }[]) =>
    rows.map((row) => byId.get(row.contributorId)).filter((row) => row !== undefined);

  return {
    task,
    clientId,
    client: clientRows.find((row) => row.id === clientId) ?? null,
    clients: clientRows,
    contributors: contributorRows,
    assignees: people(assigneeRows),
    collaborators: people(collaboratorRows),
    stakeholders: people(stakeholderRows),
    assets: assetRows.map((asset) => ({
      ...asset,
      parsedSlides: JSON.parse(asset.slides ?? "[]") as AssetSlide[],
      notes: noteRows.filter((note) => note.assetId === asset.id),
    })),
    comments: commentRows.map((comment) => ({
      ...comment,
      authorName: byId.get(comment.authorId)?.name ?? "Someone",
    })),
    categories: categoryRows,
    category: categoryRows.find((row) => row.id === task.categoryId) ?? null,
  };
}

export type TaskWorkspace = NonNullable<Awaited<ReturnType<typeof getTaskWorkspace>>>;

export async function listCommunities() {
  const rows = await db
    .select({ community: communities, client: clients })
    .from(communities)
    .leftJoin(clients, eq(communities.clientId, clients.id))
    .orderBy(desc(communities.memberCount));

  const nextBroadcast = await db
    .select({ broadcast: broadcasts, community: communities })
    .from(broadcasts)
    .innerJoin(communities, eq(broadcasts.communityId, communities.id))
    .where(ne(broadcasts.state, "sent"))
    .orderBy(asc(broadcasts.scheduledAt))
    .get();

  const sync = await db.query.integrationSyncs.findFirst({
    where: eq(integrationSyncs.provider, "whatsapp"),
  });

  return { rows, nextBroadcast: nextBroadcast ?? null, sync: sync ?? null };
}

export async function listTopics(clientId?: string) {
  const rows = await db
    .select({ topic: topics, client: clients })
    .from(topics)
    .leftJoin(clients, eq(topics.clientId, clients.id))
    .where(clientId ? eq(topics.clientId, clientId) : ne(topics.state, "dismissed"))
    .orderBy(desc(topics.momentumPct));

  const sync = await db.query.integrationSyncs.findFirst({
    where: eq(integrationSyncs.provider, "instagram"),
  });

  return { rows, sync: sync ?? null };
}

export async function listCaptionDrafts() {
  return db
    .select({ draft: captionDrafts, client: clients, asset: assets })
    .from(captionDrafts)
    .innerJoin(clients, eq(captionDrafts.clientId, clients.id))
    .leftJoin(assets, eq(captionDrafts.assetId, assets.id))
    .orderBy(desc(captionDrafts.createdAt));
}

export async function listScheduledPosts() {
  return db
    .select({ post: scheduledPosts, client: clients })
    .from(scheduledPosts)
    .innerJoin(clients, eq(scheduledPosts.clientId, clients.id))
    .orderBy(asc(scheduledPosts.scheduledAt));
}

export interface AgencyHealth {
  score: number;
  label: string;
  delta: number;
  drivers: { name: string; value: number }[];
  kpis: { label: string; value: number }[];
  interventions: { client: string; detail: string; severity: string }[];
  velocity: { date: string; created: number; comments: number }[];
  postsThisWeek: number;
  overdueCaptions: number;
}

export async function getAgencyHealth(): Promise<AgencyHealth> {
  const [taskRows, columnRows, approvalRows, clientRows, commentRows, postRows, assigneeRows] =
    await Promise.all([
      db.select().from(tasks),
      db.select().from(columns),
      db.select().from(approvals).where(eq(approvals.state, "pending")),
      db.select().from(clients),
      db.select().from(comments),
      db.select().from(scheduledPosts),
      db.select().from(taskAssignees),
    ]);

  const columnKind = new Map(columnRows.map((column) => [column.id, column.name.toLowerCase()]));
  const isDone = (columnId: string) => /done|archive/.test(columnKind.get(columnId) ?? "");
  const isReview = (columnId: string) => /review/.test(columnKind.get(columnId) ?? "");
  const isProduction = (columnId: string) =>
    /production|doing|progress/.test(columnKind.get(columnId) ?? "");

  const open = taskRows.filter((task) => !isDone(task.columnId));
  const review = taskRows.filter((task) => isReview(task.columnId));
  const production = taskRows.filter((task) => isProduction(task.columnId));
  const assigned = new Set(assigneeRows.map((row) => row.taskId));
  const unassigned = open.filter((task) => !assigned.has(task.id));
  const stale = open.filter(
    (task) => task.createdAt && Date.now() - task.createdAt.getTime() > 7 * DAY_MS,
  );

  const onTime = open.length ? 1 - stale.length / open.length : 1;
  const reviewLoad = open.length ? 1 - review.length / Math.max(open.length, 1) : 1;
  const hygiene = open.length ? 1 - unassigned.length / open.length : 1;
  const slaRisk = approvalRows.length
    ? 1 -
      approvalRows.filter((row) => row.createdAt && Date.now() - row.createdAt.getTime() > DAY_MS)
        .length /
        approvalRows.length
    : 1;

  const drivers = [
    { name: "On-time momentum", value: Math.round(onTime * 100) },
    { name: "Review load", value: Math.round(reviewLoad * 100) },
    { name: "Assignment hygiene", value: Math.round(hygiene * 100) },
    { name: "Client feedback SLA", value: Math.round(slaRisk * 100) },
  ];
  const score = Math.round(drivers.reduce((sum, driver) => sum + driver.value, 0) / drivers.length);
  const label =
    score >= 85 ? "HEALTHY" : score >= 70 ? "STEADY" : score >= 50 ? "STRAINED" : "AT RISK";

  const interventions = clientRows
    .map((client) => {
      const pending = approvalRows.filter((row) => row.clientId === client.id);
      const aging = pending.filter(
        (row) => row.createdAt && Date.now() - row.createdAt.getTime() > 12 * 3600_000,
      );
      if (aging.length) {
        return {
          client: client.name,
          detail: `${aging.length} approval${aging.length === 1 ? "" : "s"} aging past 12h`,
          severity: "High",
        };
      }
      if (pending.length) {
        return {
          client: client.name,
          detail: `${pending.length} awaiting your decision`,
          severity: "Watch",
        };
      }
      return null;
    })
    .filter(Boolean) as { client: string; detail: string; severity: string }[];

  // 14-day trace of work created and commented on.
  const velocity: { date: string; created: number; comments: number }[] = [];
  for (let index = 13; index >= 0; index -= 1) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - index);
    const next = new Date(day.getTime() + DAY_MS);
    velocity.push({
      date: day.toISOString().slice(0, 10),
      created: taskRows.filter(
        (task) => task.createdAt && task.createdAt >= day && task.createdAt < next,
      ).length,
      comments: commentRows.filter(
        (comment) => comment.createdAt && comment.createdAt >= day && comment.createdAt < next,
      ).length,
    });
  }

  const weekEnd = new Date(Date.now() + 7 * DAY_MS);
  return {
    score,
    label,
    delta: -4,
    drivers,
    kpis: [
      { label: "Open work", value: open.length },
      { label: "In production", value: production.length },
      { label: "Client approval", value: approvalRows.length },
      { label: "Gone quiet", value: stale.length },
    ],
    interventions,
    velocity,
    postsThisWeek: postRows.filter((post) => post.scheduledAt <= weekEnd).length,
    overdueCaptions: unassigned.length,
  };
}
