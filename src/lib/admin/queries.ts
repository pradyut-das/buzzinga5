import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { boardMembers, boards, clients, taskCategories, tasks, users } from "@/db/schema";
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
