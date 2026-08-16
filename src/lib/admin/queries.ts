import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiUsage,
  approvals,
  assets,
  boardMembers,
  boards,
  clients,
  contributors,
  integrationSyncs,
  pendingNotifications,
  reviewNotes,
  scheduledPosts,
  sentEmails,
  tags,
  taskAssignees,
  taskCategories,
  taskTags,
  tasks,
  users,
} from "@/db/schema";
import { isAdminEmail } from "@/lib/auth/admin";

/**
 * Read models for the admin console. Every row carries the counts an admin
 * needs before deleting it, so nobody wipes a client without seeing what
 * hangs off it first.
 */

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  boardCount: number;
  createdAt: Date | null;
}

export interface AdminClient {
  id: string;
  name: string;
  initials: string;
  color: string;
  contact: string | null;
  cadence: string | null;
  boardCount: number;
  archivedAt: Date | null;
  createdAt: Date | null;
}

export interface AdminBoard {
  id: string;
  title: string;
  clientId: string | null;
  clientName: string | null;
  ownerEmail: string | null;
  hasPassword: boolean;
  memberCount: number;
  taskCount: number;
  createdAt: Date | null;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
      boardCount: sql<number>`(select count(*) from ${boardMembers} where ${boardMembers.userId} = ${users.id})`,
    })
    .from(users)
    .orderBy(asc(users.email));

  return rows.map((row) => ({ ...row, isAdmin: isAdminEmail(row.email) }));
}

export async function listAdminClients(): Promise<AdminClient[]> {
  return db
    .select({
      id: clients.id,
      name: clients.name,
      initials: clients.initials,
      color: clients.color,
      contact: clients.contact,
      cadence: clients.cadence,
      archivedAt: clients.archivedAt,
      createdAt: clients.createdAt,
      boardCount: sql<number>`(select count(*) from ${boards} where ${boards.clientId} = ${clients.id})`,
    })
    .from(clients)
    .orderBy(asc(clients.name));
}

export async function listAdminBoards(): Promise<AdminBoard[]> {
  const rows = await db
    .select({
      id: boards.id,
      title: boards.title,
      clientId: boards.clientId,
      clientName: clients.name,
      ownerEmail: users.email,
      passwordHash: boards.passwordHash,
      createdAt: boards.createdAt,
      memberCount: sql<number>`(select count(*) from ${boardMembers} where ${boardMembers.boardId} = ${boards.id})`,
      taskCount: sql<number>`(select count(*) from ${tasks} where ${tasks.boardId} = ${boards.id})`,
    })
    .from(boards)
    .leftJoin(clients, eq(clients.id, boards.clientId))
    .leftJoin(users, eq(users.id, boards.ownerId))
    .orderBy(desc(boards.createdAt));

  return rows.map(({ passwordHash, ...row }) => ({
    ...row,
    hasPassword: Boolean(passwordHash),
  }));
}

export interface AdminCategory {
  id: string;
  boardId: string;
  boardTitle: string;
  name: string;
  color: string;
  position: number;
  taskCount: number;
}

/** Every board's categories in one list — the console is board-agnostic. */
export async function listAdminCategories(): Promise<AdminCategory[]> {
  return db
    .select({
      id: taskCategories.id,
      boardId: taskCategories.boardId,
      boardTitle: boards.title,
      name: taskCategories.name,
      color: taskCategories.color,
      position: taskCategories.position,
      taskCount: sql<number>`(select count(*) from ${tasks} where ${tasks.categoryId} = ${taskCategories.id})`,
    })
    .from(taskCategories)
    .innerJoin(boards, eq(boards.id, taskCategories.boardId))
    .orderBy(asc(boards.title), asc(taskCategories.position), asc(taskCategories.name));
}

// ── Overview ───────────────────────────────────────────────────────────────

export interface AdminOverview {
  users: number;
  clients: number;
  activeClients: number;
  boards: number;
  tasks: number;
  openTasks: number;
  contributors: number;
  unsubscribed: number;
  pendingNotifications: number;
  emailsSentToday: number;
  emailsFailedToday: number;
  assets: number;
  pendingApprovals: number;
  openReviewNotes: number;
  failedPosts: number;
  scheduledPosts: number;
  aiCallsToday: number;
  aiCostMicroUsdToday: number;
  aiErrorsToday: number;
}

/** One number per thing an admin would page someone about. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const daySeconds = Math.floor(dayStart.getTime() / 1000);

  const [row] = await db
    .select({
      users: sql<number>`(select count(*) from ${users})`,
      clients: sql<number>`(select count(*) from ${clients})`,
      activeClients: sql<number>`(select count(*) from ${clients} where ${clients.archivedAt} is null)`,
      boards: sql<number>`(select count(*) from ${boards})`,
      tasks: sql<number>`(select count(*) from ${tasks})`,
      openTasks: sql<number>`(select count(*) from ${tasks} where ${tasks.status} <> 'done')`,
      contributors: sql<number>`(select count(*) from ${contributors})`,
      unsubscribed: sql<number>`(select count(*) from ${contributors} where ${contributors.unsubscribedAt} is not null)`,
      pendingNotifications: sql<number>`(select count(*) from ${pendingNotifications})`,
      emailsSentToday: sql<number>`(select count(*) from ${sentEmails} where ${sentEmails.createdAt} >= ${daySeconds})`,
      emailsFailedToday: sql<number>`(select count(*) from ${sentEmails} where ${sentEmails.createdAt} >= ${daySeconds} and ${sentEmails.sentToResend} = 0)`,
      assets: sql<number>`(select count(*) from ${assets})`,
      pendingApprovals: sql<number>`(select count(*) from ${approvals} where ${approvals.state} = 'pending')`,
      openReviewNotes: sql<number>`(select count(*) from ${reviewNotes} where ${reviewNotes.resolvedAt} is null)`,
      failedPosts: sql<number>`(select count(*) from ${scheduledPosts} where ${scheduledPosts.state} = 'failed')`,
      scheduledPosts: sql<number>`(select count(*) from ${scheduledPosts} where ${scheduledPosts.state} in ('scheduled','ready','planned'))`,
      aiCallsToday: sql<number>`(select count(*) from ${aiUsage} where ${aiUsage.createdAt} >= ${daySeconds})`,
      aiCostMicroUsdToday: sql<number>`(select coalesce(sum(${aiUsage.costMicroUsd}), 0) from ${aiUsage} where ${aiUsage.createdAt} >= ${daySeconds})`,
      aiErrorsToday: sql<number>`(select count(*) from ${aiUsage} where ${aiUsage.createdAt} >= ${daySeconds} and ${aiUsage.status} <> 'ok')`,
    })
    .from(sql`(select 1)`);

  return row;
}

// ── People on boards ───────────────────────────────────────────────────────

export interface AdminContributor {
  id: string;
  name: string;
  email: string | null;
  color: string;
  boardId: string;
  boardTitle: string;
  userId: string | null;
  unsubscribedAt: Date | null;
  taskCount: number;
}

/**
 * Contributors are per-board, so the same person appears once per board they
 * work on. Listed flat with the board named on each row — an admin looking
 * for "why did this address stop getting mail" is searching by address, not
 * by board.
 */
export async function listAdminContributors(): Promise<AdminContributor[]> {
  return db
    .select({
      id: contributors.id,
      name: contributors.name,
      email: contributors.email,
      color: contributors.color,
      boardId: contributors.boardId,
      boardTitle: boards.title,
      userId: contributors.userId,
      unsubscribedAt: contributors.unsubscribedAt,
      taskCount: sql<number>`(select count(*) from ${taskAssignees} where ${taskAssignees.contributorId} = ${contributors.id})`,
    })
    .from(contributors)
    .innerJoin(boards, eq(boards.id, contributors.boardId))
    .orderBy(asc(contributors.name), asc(boards.title));
}

// ── Tags ───────────────────────────────────────────────────────────────────

export interface AdminTag {
  id: string;
  name: string;
  color: string;
  boardId: string;
  boardTitle: string;
  taskCount: number;
}

export async function listAdminTags(): Promise<AdminTag[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      boardId: tags.boardId,
      boardTitle: boards.title,
      taskCount: sql<number>`(select count(*) from ${taskTags} where ${taskTags.tagId} = ${tags.id})`,
    })
    .from(tags)
    .innerJoin(boards, eq(boards.id, tags.boardId))
    .orderBy(asc(boards.title), asc(tags.name));
}

// ── Email delivery ─────────────────────────────────────────────────────────

export interface AdminSentEmail {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  boardTitle: string;
  sentToResend: boolean | null;
  createdAt: Date | null;
}

/** The delivery log, newest first. Bounded — this is a tail, not an archive. */
export async function listAdminSentEmails(limit = 100): Promise<AdminSentEmail[]> {
  return db
    .select({
      id: sentEmails.id,
      recipientEmail: sentEmails.recipientEmail,
      recipientName: sentEmails.recipientName,
      subject: sentEmails.subject,
      boardTitle: sentEmails.boardTitle,
      sentToResend: sentEmails.sentToResend,
      createdAt: sentEmails.createdAt,
    })
    .from(sentEmails)
    .orderBy(desc(sentEmails.createdAt))
    .limit(limit);
}

export interface AdminPendingNotification {
  id: string;
  type: string;
  boardTitle: string;
  taskTitle: string;
  recipientName: string;
  recipientEmail: string | null;
  createdAt: Date | null;
}

/** The queue the digest cron drains. A backlog here means the cron is stuck. */
export async function listAdminPendingNotifications(
  limit = 100,
): Promise<AdminPendingNotification[]> {
  return db
    .select({
      id: pendingNotifications.id,
      type: pendingNotifications.type,
      boardTitle: boards.title,
      taskTitle: tasks.title,
      recipientName: contributors.name,
      recipientEmail: contributors.email,
      createdAt: pendingNotifications.createdAt,
    })
    .from(pendingNotifications)
    .innerJoin(boards, eq(boards.id, pendingNotifications.boardId))
    .innerJoin(tasks, eq(tasks.id, pendingNotifications.taskId))
    .innerJoin(contributors, eq(contributors.id, pendingNotifications.recipientId))
    .orderBy(desc(pendingNotifications.createdAt))
    .limit(limit);
}

// ── Delivery pipeline ──────────────────────────────────────────────────────

export interface AdminApproval {
  id: string;
  assetTitle: string;
  clientName: string;
  state: string;
  reason: string | null;
  dueAt: Date | null;
  createdAt: Date | null;
}

export async function listAdminApprovals(limit = 100): Promise<AdminApproval[]> {
  return db
    .select({
      id: approvals.id,
      assetTitle: assets.title,
      clientName: clients.name,
      state: approvals.state,
      reason: approvals.reason,
      dueAt: approvals.dueAt,
      createdAt: approvals.createdAt,
    })
    .from(approvals)
    .innerJoin(assets, eq(assets.id, approvals.assetId))
    .innerJoin(clients, eq(clients.id, approvals.clientId))
    .orderBy(desc(approvals.createdAt))
    .limit(limit);
}

export interface AdminScheduledPost {
  id: string;
  title: string;
  clientName: string;
  platform: string;
  state: string;
  scheduledAt: Date;
  publishedAt: Date | null;
  error: string | null;
}

export async function listAdminScheduledPosts(limit = 100): Promise<AdminScheduledPost[]> {
  return db
    .select({
      id: scheduledPosts.id,
      title: scheduledPosts.title,
      clientName: clients.name,
      platform: scheduledPosts.platform,
      state: scheduledPosts.state,
      scheduledAt: scheduledPosts.scheduledAt,
      publishedAt: scheduledPosts.publishedAt,
      error: scheduledPosts.error,
    })
    .from(scheduledPosts)
    .innerJoin(clients, eq(clients.id, scheduledPosts.clientId))
    .orderBy(desc(scheduledPosts.scheduledAt))
    .limit(limit);
}

export interface AdminIntegration {
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  detail: string | null;
}

export async function listAdminIntegrations(): Promise<AdminIntegration[]> {
  return db
    .select({
      provider: integrationSyncs.provider,
      status: integrationSyncs.status,
      lastSyncAt: integrationSyncs.lastSyncAt,
      detail: integrationSyncs.detail,
    })
    .from(integrationSyncs)
    .orderBy(asc(integrationSyncs.provider));
}
