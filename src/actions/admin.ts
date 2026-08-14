"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { boardMembers, boards, clients, columns, taskCategories, tasks, users } from "@/db/schema";
import { addBoardMember } from "@/lib/auth/membership";
import { requireAdmin } from "@/lib/auth/admin";
import { deleteBoardCascade, deleteClientCascade, deleteUserCascade } from "@/lib/admin/cascade";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword } from "@/lib/password-hash";
import { indexClient } from "@/lib/search/indexer";

/**
 * Top-level CRUD for the admin console. Every export starts with
 * `requireAdmin()`, so the allowlist is checked on the server for each write
 * — the page hiding a button is presentation, not authorization.
 */

export interface AdminResult {
  success: boolean;
  error?: string;
}

function ok(): AdminResult {
  revalidatePath("/admin");
  revalidatePath("/");
  return { success: true };
}

function fail(error: string): AdminResult {
  return { success: false, error };
}

/** Turns a thrown DB/validation error into a message the console can show. */
async function guard(run: () => Promise<AdminResult>): Promise<AdminResult> {
  try {
    return await run();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Something went wrong");
  }
}

// ── Users ──────────────────────────────────────────────────────────────────

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  email: z.email({ message: "Enter a valid email" }).transform((value) => value.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export async function adminCreateUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = userSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const existing = await db.query.users.findFirst({
      where: eq(users.email, parsed.data.email),
      columns: { id: true },
    });
    if (existing) return fail("An account with this email already exists");

    // Supabase is the source of truth for identity, so it allocates the id.
    // Admin-created accounts skip the confirmation email — an admin vouching
    // for the address is the confirmation.
    const { data, error } = await createAdminClient().auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { name: parsed.data.name },
    });

    if (error || !data.user) {
      return fail(error?.message ?? "Could not create the account");
    }

    await db.insert(users).values({
      id: data.user.id,
      name: parsed.data.name,
      email: parsed.data.email,
      createdAt: new Date(),
    });

    return ok();
  });
}

/** Name and email always; password only when a new one was typed. */
export async function adminUpdateUser(
  userId: string,
  input: { name: string; email: string; password?: string },
): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = userSchema
      .omit({ password: true })
      .safeParse({ name: input.name, email: input.email });
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const password = input.password?.trim();
    if (password && password.length < 8) {
      return fail("Password must be at least 8 characters");
    }

    const clash = await db.query.users.findFirst({
      where: and(eq(users.email, parsed.data.email), ne(users.id, userId)),
      columns: { id: true },
    });
    if (clash) return fail("Another account already uses this email");

    // Supabase first — it holds the credentials, and a local-only rename would
    // drift the mirror out of step with what the user actually signs in with.
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      email: parsed.data.email,
      email_confirm: true,
      user_metadata: { name: parsed.data.name },
      ...(password ? { password } : {}),
    });

    if (error) return fail(error.message);

    await db
      .update(users)
      .set({ name: parsed.data.name, email: parsed.data.email })
      .where(eq(users.id, userId));

    return ok();
  });
}

export async function adminDeleteUser(userId: string): Promise<AdminResult> {
  return guard(async () => {
    const admin = await requireAdmin();
    // Locking yourself out of the console is not a recoverable mistake.
    if (admin.id === userId) return fail("You cannot delete your own account");

    await deleteUserCascade(userId);
    return ok();
  });
}

// ── Clients ────────────────────────────────────────────────────────────────

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  initials: z.string().trim().min(1, "Initials are required").max(2, "Two letters at most"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #d8b4fe"),
  contact: z.string().trim().max(160).optional(),
  cadence: z.string().trim().max(400).optional(),
});

export type AdminClientInput = z.input<typeof clientSchema>;

export async function adminCreateClient(input: AdminClientInput): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = clientSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const inserted = await db
      .insert(clients)
      .values({
        id: randomUUID(),
        name: parsed.data.name,
        initials: parsed.data.initials.toUpperCase(),
        color: parsed.data.color,
        contact: parsed.data.contact || null,
        cadence: parsed.data.cadence || null,
        createdAt: new Date(),
      })
      .returning({ id: clients.id });
    if (inserted[0]) void indexClient(inserted[0].id);

    return ok();
  });
}

export async function adminUpdateClient(
  clientId: string,
  input: AdminClientInput,
): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = clientSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    await db
      .update(clients)
      .set({
        name: parsed.data.name,
        initials: parsed.data.initials.toUpperCase(),
        color: parsed.data.color,
        contact: parsed.data.contact || null,
        cadence: parsed.data.cadence || null,
      })
      .where(eq(clients.id, clientId));

    void indexClient(clientId);

    return ok();
  });
}

/** Archiving hides a client from the rail without touching their work. */
export async function adminSetClientArchived(
  clientId: string,
  archived: boolean,
): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    await db
      .update(clients)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(clients.id, clientId));
    return ok();
  });
}

export async function adminDeleteClient(clientId: string): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    await deleteClientCascade(clientId);
    return ok();
  });
}

// ── Boards ─────────────────────────────────────────────────────────────────

const boardSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
  clientId: z.string().trim().optional(),
});

export async function adminCreateBoard(input: {
  title: string;
  clientId?: string;
  password?: string;
}): Promise<AdminResult> {
  return guard(async () => {
    const admin = await requireAdmin();
    const parsed = boardSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const password = input.password?.trim();
    const id = randomUUID();

    await db.insert(boards).values({
      id,
      title: parsed.data.title,
      clientId: parsed.data.clientId || null,
      passwordHash: password ? hashPassword(password) : null,
      ownerId: admin.id,
      createdAt: new Date(),
    });
    await addBoardMember(id, admin.id, "owner");

    const defaultColumns = ["📥 To do", "🔄 Doing", "✅ Done"];
    for (let i = 0; i < defaultColumns.length; i++) {
      await db.insert(columns).values({
        id: randomUUID(),
        boardId: id,
        name: defaultColumns[i],
        position: i,
      });
    }
    await db.insert(columns).values({
      id: randomUUID(),
      boardId: id,
      name: "📦 Archive",
      position: defaultColumns.length,
      isCollapsed: true,
    });

    return ok();
  });
}

export async function adminUpdateBoard(
  boardId: string,
  input: { title: string; clientId?: string; password?: string },
): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = boardSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const password = input.password?.trim();
    await db
      .update(boards)
      .set({
        title: parsed.data.title,
        clientId: parsed.data.clientId || null,
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      })
      .where(eq(boards.id, boardId));

    revalidatePath(`/boards/${boardId}`);
    return ok();
  });
}

/** Drops the password gate entirely; members-only access still applies. */
export async function adminClearBoardPassword(boardId: string): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    await db.update(boards).set({ passwordHash: null }).where(eq(boards.id, boardId));
    revalidatePath(`/boards/${boardId}`);
    return ok();
  });
}

export async function adminSetBoardMember(
  boardId: string,
  email: string,
  member: boolean,
): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsedEmail = z.email().safeParse(email.trim().toLowerCase());
    if (!parsedEmail.success) return fail("Enter a valid email");

    const user = await db.query.users.findFirst({
      where: eq(users.email, parsedEmail.data),
      columns: { id: true },
    });
    if (!user) return fail("No account with that email");

    if (member) {
      await addBoardMember(boardId, user.id);
    } else {
      await db
        .delete(boardMembers)
        .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, user.id)));
    }

    return ok();
  });
}

export async function adminDeleteBoard(boardId: string): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    await deleteBoardCascade(boardId);
    return ok();
  });
}

// ── Task categories ────────────────────────────────────────────────────────

const categorySchema = z.object({
  boardId: z.string().trim().min(1, "Pick a board"),
  name: z.string().trim().min(1, "Name is required").max(60, "Name is too long"),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value like #d8b4fe"),
  position: z.number().int().min(0).max(999).default(0),
});

export type AdminCategoryInput = z.input<typeof categorySchema>;

export async function adminCreateCategory(input: AdminCategoryInput): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    const clash = await db.query.taskCategories.findFirst({
      where: and(
        eq(taskCategories.boardId, parsed.data.boardId),
        eq(taskCategories.name, parsed.data.name),
      ),
      columns: { id: true },
    });
    if (clash) return fail("That board already has a category with this name");

    await db.insert(taskCategories).values({
      id: randomUUID(),
      boardId: parsed.data.boardId,
      name: parsed.data.name,
      color: parsed.data.color,
      position: parsed.data.position,
      createdAt: new Date(),
    });

    return ok();
  });
}

export async function adminUpdateCategory(
  categoryId: string,
  input: { name: string; color: string; position: number },
): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    const parsed = categorySchema.omit({ boardId: true }).safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0].message);

    await db
      .update(taskCategories)
      .set({ name: parsed.data.name, color: parsed.data.color, position: parsed.data.position })
      .where(eq(taskCategories.id, categoryId));

    return ok();
  });
}

/** Tasks filed under it survive; they simply become uncategorized. */
export async function adminDeleteCategory(categoryId: string): Promise<AdminResult> {
  return guard(async () => {
    await requireAdmin();
    await db.update(tasks).set({ categoryId: null }).where(eq(tasks.categoryId, categoryId));
    await db.delete(taskCategories).where(eq(taskCategories.id, categoryId));
    return ok();
  });
}
