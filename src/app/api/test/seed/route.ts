import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { boards, columns, tasks, contributors, taskAssignees, users } from "@/db/schema";
import { hashPassword } from "@/lib/password-hash";
import { setBoardPassword } from "@/lib/board-password";
import { createSession, getCurrentUser } from "@/lib/auth/session";
import { addBoardMember } from "@/lib/auth/membership";

// Only available in test environments (PLAYWRIGHT_TEST is set by playwright config)
// We can't rely on NODE_ENV because Next.js production builds force it to "production"
const IS_TEST_ENV =
  process.env.PLAYWRIGHT_TEST === "true" || process.env.NODE_ENV === "development";

interface SeedBoardRequest {
  title?: string;
  password?: string;
  /** Optional: pre-create tasks in columns */
  tasks?: Array<{
    title: string;
    columnIndex?: number; // 0=To Do, 1=Doing, 2=Done, 3=Archive
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
  // request has no session yet.
  let user = await getCurrentUser();
  if (!user) {
    const userId = crypto.randomUUID();
    const email = `seed-${userId}@example.com`;
    await db.insert(users).values({
      id: userId,
      email,
      name: "Seed User",
      passwordHash: hashPassword("seedpass123"),
      createdAt: new Date(),
    });
    await createSession(userId);
    user = { id: userId, email, name: "Seed User" };
  }

  // Create board
  await db.insert(boards).values({
    id: boardId,
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
    columnIds,
    taskIds,
    contributorIds,
  };

  return NextResponse.json(response);
}
