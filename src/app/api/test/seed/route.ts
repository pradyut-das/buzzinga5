import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  boards,
  clients,
  columns,
  tasks,
  contributors,
  taskAssignees,
  taskCategories,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/password-hash";
import { setBoardPassword } from "@/lib/board-password";
import { getCurrentUser } from "@/lib/auth/session";
import { addBoardMember } from "@/lib/auth/membership";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Only available in test environments (PLAYWRIGHT_TEST is set by playwright config)
// We can't rely on NODE_ENV because Next.js production builds force it to "production"
const IS_TEST_ENV =
  process.env.PLAYWRIGHT_TEST === "true" || process.env.NODE_ENV === "development";

/** Seeds are written by name, so a category is created the first time it is used. */
async function categoryId(boardId: string, name: string): Promise<string> {
  const existing = await db.query.taskCategories.findFirst({
    where: and(eq(taskCategories.boardId, boardId), eq(taskCategories.name, name)),
    columns: { id: true },
  });
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db.insert(taskCategories).values({ id, boardId, name, position: 0 });
  return id;
}

interface SeedBoardRequest {
  title?: string;
  password?: string;
  /** Attaches the board to a client, which is what the desk screens read. */
  client?: string;
  /** Optional: pre-create tasks in columns */
  tasks?: Array<{
    title: string;
    columnIndex?: number; // 0=To Do, 1=Doing, 2=Done, 3=Archive
    /** A category name; created on the board the first time it is used. */
    category?: string;
    assignees?: string[]; // contributor names to create and assign
    /** Optional: offset from base time in seconds (for deterministic ordering) */
    createdAtOffset?: number;
  }>;
  /** Optional: pre-create contributors */
  contributors?: Array<{
    name: string;
    email?: string;
  }>;
}

interface SeedBoardResponse {
  boardId: string;
  clientId: string | null;
  columnIds: string[];
  taskIds: string[];
  contributorIds: Record<string, string>; // name -> id mapping
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!IS_TEST_ENV) {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const body = (await request.json()) as SeedBoardRequest;
  const title = body.title ?? "Test Board";
  const password = body.password ?? "testpass123";

  const boardId = crypto.randomUUID();
  const passwordHash = hashPassword(password);

  // Boards require a signed-in owner, so seed a throwaway account when the
  // request has no session yet. The account is created in Supabase and then
  // signed in for real, so the response carries genuine auth cookies rather
  // than a fixture the app would reject.
  let user = await getCurrentUser();
  if (!user) {
    const email = `seed-${crypto.randomUUID()}@example.com`;
    const seedPassword = "seedpass123";

    const { data, error } = await createAdminClient().auth.admin.createUser({
      email,
      password: seedPassword,
      email_confirm: true,
      user_metadata: { name: "Seed User" },
    });

    if (error || !data.user) {
      return NextResponse.json(
        { error: `Could not seed a user: ${error?.message ?? "unknown error"}` },
        { status: 500 },
      );
    }

    await db.insert(users).values({
      id: data.user.id,
      email,
      name: "Seed User",
      createdAt: new Date(),
    });

    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: seedPassword,
    });
    if (signInError) {
      return NextResponse.json(
        { error: `Could not sign in the seeded user: ${signInError.message}` },
        { status: 500 },
      );
    }

    user = { id: data.user.id, email, name: "Seed User" };
  }

  // A client is optional: the older board tests do not need one, the desk
  // screens cannot work without one.
  let clientId: string | null = null;
  if (body.client) {
    clientId = crypto.randomUUID();
    await db.insert(clients).values({
      id: clientId,
      name: body.client,
      initials: body.client.slice(0, 2).toUpperCase(),
      color: "#d8b4fe",
    });
  }

  // Create board
  await db.insert(boards).values({
    id: boardId,
    clientId,
    title,
    passwordHash,
    ownerId: user.id,
    createdAt: new Date(),
  });

  await addBoardMember(boardId, user.id, "owner");

  // Create default columns
  const defaultColumnNames = ["📥 To do", "🔄 Doing", "✅ Done", "📦 Archive"];
  const columnIds: string[] = [];

  for (let i = 0; i < defaultColumnNames.length; i++) {
    const columnId = crypto.randomUUID();
    columnIds.push(columnId);
    await db.insert(columns).values({
      id: columnId,
      boardId,
      name: defaultColumnNames[i],
      position: i,
      isCollapsed: i === 3, // Archive is collapsed
    });
  }

  // Create contributors if requested
  const contributorIds: Record<string, string> = {};
  const contributorColors = [
    "rose",
    "blue",
    "green",
    "purple",
    "orange",
    "cyan",
    "pink",
    "yellow",
  ] as const;
  let colorIndex = 0;

  if (body.contributors) {
    for (const contrib of body.contributors) {
      const contributorId = crypto.randomUUID();
      contributorIds[contrib.name] = contributorId;
      await db.insert(contributors).values({
        id: contributorId,
        boardId,
        name: contrib.name,
        email: contrib.email,
        color: contributorColors[colorIndex % contributorColors.length],
      });
      colorIndex++;
    }
  }

  // Create tasks if requested
  const taskIds: string[] = [];
  const baseTime = new Date();
  if (body.tasks) {
    for (let taskIndex = 0; taskIndex < body.tasks.length; taskIndex++) {
      const taskDef = body.tasks[taskIndex];
      const columnIndex = taskDef.columnIndex ?? 0;
      const taskId = crypto.randomUUID();
      taskIds.push(taskId);

      // Use explicit offset, or default to spreading tasks 1 second apart
      const offsetSeconds = taskDef.createdAtOffset ?? taskIndex;
      const createdAt = new Date(baseTime.getTime() + offsetSeconds * 1000);

      await db.insert(tasks).values({
        id: taskId,
        boardId,
        columnId: columnIds[columnIndex],
        title: taskDef.title,
        categoryId: taskDef.category ? await categoryId(boardId, taskDef.category) : null,
        clientId,
        position: taskIds.length - 1,
        priority: "none",
        createdAt,
      });

      // Create and assign contributors for this task
      if (taskDef.assignees) {
        for (const assigneeName of taskDef.assignees) {
          // Create contributor if doesn't exist
          if (!contributorIds[assigneeName]) {
            const contributorId = crypto.randomUUID();
            contributorIds[assigneeName] = contributorId;
            await db.insert(contributors).values({
              id: contributorId,
              boardId,
              name: assigneeName,
              color: contributorColors[colorIndex % contributorColors.length],
            });
            colorIndex++;
          }

          // Assign to task
          await db.insert(taskAssignees).values({
            taskId,
            contributorId: contributorIds[assigneeName],
          });
        }
      }
    }
  }

  // Set password cookie
  await setBoardPassword(boardId, password);

  const response: SeedBoardResponse = {
    boardId,
    clientId,
    columnIds,
    taskIds,
    contributorIds,
  };

  return NextResponse.json(response);
}
