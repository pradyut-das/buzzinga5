/**
 * Imports the agency's live data out of Supabase into the v2 schema.
 *
 * Supabase holds four tables — clients, profiles, tasks, task_activity — from
 * the previous tool. The mapping is:
 *
 *   clients        → clients + one content board each (a board *is* a client)
 *   profiles       → contributors on every board they touch, role kept
 *   tasks.status   → the board column (todo / progress / review / done)
 *   tasks.approval → an approval + an asset for anything awaiting a decision
 *   tasks.*_date   → a scheduled post, so the calendar shows real going-out days
 *   task_activity  → comments on the task, in order
 *
 * Asset kind is read from the task title and the client's cadence note, since
 * that is where this agency records "reel" vs "carousel" vs "YouTube".
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... SEED_FOUNDER_PASSWORD=... pnpm db:import
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  approvals,
  assets,
  boardMembers,
  boards,
  broadcasts,
  captionDrafts,
  clients,
  columns,
  comments,
  communities,
  contributors,
  reviewNotes,
  scheduledPosts,
  taskAssignees,
  tasks,
  taskTags,
  tags,
  topics,
  users,
  type AssetKind,
  type ContributorColor,
} from "@/db/schema";
import { hashPassword } from "@/lib/password-hash";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

const FOUNDER_EMAIL = process.env.SEED_FOUNDER_EMAIL ?? "founder@example.com";
const FOUNDER_NAME = process.env.SEED_FOUNDER_NAME ?? "Founder";

function requireSeedPassword(): string {
  const password = process.env.SEED_FOUNDER_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_FOUNDER_PASSWORD is required; import scripts never contain a default password.",
    );
  }
  return password;
}

const FOUNDER_PASSWORD = requireSeedPassword();

interface SbClient {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  created_at: string;
}
interface SbProfile {
  id: string;
  full_name: string | null;
  role: string;
  created_at: string;
}
interface SbTask {
  id: string;
  title: string;
  description: string | null;
  client_id: string | null;
  assignee_id: string | null;
  editor_id: string | null;
  status: string;
  approval: string;
  going_out_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
}
interface SbActivity {
  id: string;
  task_id: string;
  user_id: string | null;
  text: string;
  created_at: string;
}

async function fetchAll<T>(table: string): Promise<T[]> {
  const out: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=created_at.asc`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Range: `${from}-${from + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      throw new Error(`${table}: ${response.status} ${await response.text()}`);
    }
    const page = (await response.json()) as T[];
    out.push(...page);
    if (page.length < pageSize) return out;
  }
}

/** Columns every client board gets, in the order the agency works. */
const COLUMN_NAMES = ["To do", "In production", "Review", "Done"] as const;

const STATUS_TO_COLUMN: Record<string, number> = {
  todo: 0,
  progress: 1,
  review: 2,
  done: 3,
  approved: 3,
};

/** Only work that has reached review is actually waiting on the founder. */
const AWAITING_DECISION = new Set(["review", "done"]);

const CLIENT_COLORS = [
  "#6bc4ee",
  "#c7a6ff",
  "#ff985e",
  "#89d4aa",
  "#f4a4c0",
  "#ffd166",
  "#8ab4f8",
  "#b8e986",
  "#e59bd8",
  "#7fd4d0",
];

const CONTRIBUTOR_PALETTE: ContributorColor[] = [
  "blue",
  "violet",
  "amber",
  "emerald",
  "rose",
  "cyan",
  "orange",
  "indigo",
  "teal",
  "pink",
];

const ASSET_ACCENTS = ["#245f86", "#8f466f", "#a55323", "#326f72", "#65378f", "#2f6b45"];

function initialsOf(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (cleaned.slice(0, 2) || "??").toUpperCase();
}

/** The agency names its deliverables in the title; the cadence note is the fallback. */
function assetKindFor(title: string, cadence: string | null): AssetKind {
  const haystack = `${title} ${cadence ?? ""}`.toLowerCase();
  if (/\b(reel|video|yt|youtube|short|edit)\b/.test(haystack)) return "video";
  if (/carousel|carousal|carrousel/.test(haystack)) return "carousel";
  if (/caption|copy|script/.test(haystack)) return "caption";
  if (/story|stories/.test(haystack)) return "story";
  return "static";
}

function platformFor(title: string, cadence: string | null): string {
  const haystack = `${title} ${cadence ?? ""}`.toLowerCase();
  if (/\byt\b|youtube/.test(haystack)) return "youtube";
  if (/linkedin/.test(haystack)) return "linkedin";
  return "instagram";
}

/** "Status: In Review → In Progress" is history, not conversation. */
function isSystemActivity(text: string): boolean {
  return /^task created$|^status:|^approval:|^assigned|^due date|^moved/i.test(text.trim());
}

async function clearAll() {
  await db.delete(reviewNotes);
  await db.delete(approvals);
  await db.delete(captionDrafts);
  await db.delete(scheduledPosts);
  await db.delete(assets);
  await db.delete(broadcasts);
  await db.delete(communities);
  await db.delete(topics);
  await db.delete(taskTags);
  await db.delete(taskAssignees);
  await db.delete(comments);
  await db.delete(tasks);
  await db.delete(tags);
  await db.delete(contributors);
  await db.delete(columns);
  await db.delete(boardMembers);
  await db.delete(boards);
  await db.delete(clients);
}

async function upsertFounder(): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, FOUNDER_EMAIL),
  });
  if (existing) {
    await db
      .update(users)
      .set({ name: FOUNDER_NAME, passwordHash: hashPassword(FOUNDER_PASSWORD) })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: FOUNDER_EMAIL,
    name: FOUNDER_NAME,
    passwordHash: hashPassword(FOUNDER_PASSWORD),
  });
  return id;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY");
  }

  console.log("Reading Supabase…");
  const [sbClients, sbProfiles, sbTasks, sbActivity] = await Promise.all([
    fetchAll<SbClient>("clients"),
    fetchAll<SbProfile>("profiles"),
    fetchAll<SbTask>("tasks"),
    fetchAll<SbActivity>("task_activity"),
  ]);
  console.log(
    `clients ${sbClients.length} · profiles ${sbProfiles.length} · tasks ${sbTasks.length} · activity ${sbActivity.length}`,
  );

  const founderId = await upsertFounder();
  await clearAll();

  const profileName = new Map(
    sbProfiles.map((profile, index) => [
      profile.id,
      {
        name: profile.full_name?.trim() || `Member ${index + 1}`,
        role: profile.role,
      },
    ]),
  );

  // Which people actually appear on each client's work, so a board's
  // contributor list is the people on it rather than the whole agency.
  const peoplePerClient = new Map<string, Set<string>>();
  const taskById = new Map(sbTasks.map((task) => [task.id, task]));
  for (const task of sbTasks) {
    if (!task.client_id) continue;
    const set = peoplePerClient.get(task.client_id) ?? new Set<string>();
    for (const id of [task.assignee_id, task.editor_id, task.created_by]) {
      if (id && profileName.has(id)) set.add(id);
    }
    peoplePerClient.set(task.client_id, set);
  }
  for (const activity of sbActivity) {
    const task = taskById.get(activity.task_id);
    if (!task?.client_id || !activity.user_id || !profileName.has(activity.user_id)) continue;
    const set = peoplePerClient.get(task.client_id) ?? new Set<string>();
    set.add(activity.user_id);
    peoplePerClient.set(task.client_id, set);
  }

  const boardIdByClient = new Map<string, string>();
  const clientIdMap = new Map<string, string>();
  const contributorIdFor = new Map<string, string>(); // `${clientId}:${profileId}`

  for (const [index, sbClient] of sbClients.entries()) {
    const clientId = randomUUID();
    const boardId = randomUUID();
    clientIdMap.set(sbClient.id, clientId);
    boardIdByClient.set(sbClient.id, boardId);

    await db.insert(clients).values({
      id: clientId,
      name: sbClient.name,
      initials: initialsOf(sbClient.name),
      color: CLIENT_COLORS[index % CLIENT_COLORS.length],
      contact: sbClient.contact && sbClient.contact !== "None" ? sbClient.contact : null,
      cadence: sbClient.notes?.trim() || null,
      createdAt: new Date(sbClient.created_at),
    });

    await db.insert(boards).values({
      id: boardId,
      clientId,
      title: sbClient.name,
      ownerId: founderId,
      createdAt: new Date(sbClient.created_at),
    });
    await db.insert(boardMembers).values({ boardId, userId: founderId, role: "owner" });

    for (const [position, name] of COLUMN_NAMES.entries()) {
      await db.insert(columns).values({ id: randomUUID(), boardId, name, position });
    }

    const people = [...(peoplePerClient.get(sbClient.id) ?? new Set<string>())];
    for (const [personIndex, profileId] of people.entries()) {
      const id = randomUUID();
      contributorIdFor.set(`${clientId}:${profileId}`, id);
      await db.insert(contributors).values({
        id,
        boardId,
        name: profileName.get(profileId)!.name,
        color: CONTRIBUTOR_PALETTE[personIndex % CONTRIBUTOR_PALETTE.length],
      });
    }
  }

  const columnRows = await db.select().from(columns);
  const columnId = (boardId: string, index: number) =>
    columnRows.find((row) => row.boardId === boardId && row.position === index)!.id;

  const cadenceByClient = new Map(sbClients.map((client) => [client.id, client.notes]));
  const taskIdMap = new Map<string, string>();
  const positionPerColumn = new Map<string, number>();

  let approvalCount = 0;
  let postCount = 0;

  for (const [index, sbTask] of sbTasks.entries()) {
    if (!sbTask.client_id || !clientIdMap.has(sbTask.client_id)) continue;
    const clientId = clientIdMap.get(sbTask.client_id)!;
    const boardId = boardIdByClient.get(sbTask.client_id)!;
    const columnIndex = STATUS_TO_COLUMN[sbTask.status] ?? 0;
    const targetColumn = columnId(boardId, columnIndex);
    const position = positionPerColumn.get(targetColumn) ?? 0;
    positionPerColumn.set(targetColumn, position + 1);

    const taskId = randomUUID();
    taskIdMap.set(sbTask.id, taskId);
    const createdAt = new Date(sbTask.created_at);

    await db.insert(tasks).values({
      id: taskId,
      boardId,
      columnId: targetColumn,
      title: sbTask.title,
      // Anything already sitting in review is the work that blocks the founder.
      priority: sbTask.status === "review" ? "high" : "none",
      position,
      createdAt,
    });

    for (const personId of new Set([sbTask.assignee_id, sbTask.editor_id].filter(Boolean))) {
      const contributorId = contributorIdFor.get(`${clientId}:${personId}`);
      if (contributorId) {
        await db.insert(taskAssignees).values({ taskId, contributorId });
      }
    }

    const cadence = cadenceByClient.get(sbTask.client_id) ?? null;
    const kind = assetKindFor(sbTask.title, cadence);

    // Everything past production has a deliverable; that deliverable is what
    // the founder approves, so it becomes an asset plus a pending approval.
    if (AWAITING_DECISION.has(sbTask.status) && sbTask.approval === "pending") {
      const assetId = randomUUID();
      await db.insert(assets).values({
        id: assetId,
        clientId,
        taskId,
        kind,
        title: sbTask.title,
        accent: ASSET_ACCENTS[index % ASSET_ACCENTS.length],
        slideCount: kind === "carousel" ? 7 : null,
        durationSeconds: kind === "video" ? 30 : null,
        body: sbTask.description?.trim() || null,
        createdAt: sbTask.updated_at ? new Date(sbTask.updated_at) : createdAt,
      });

      await db.insert(approvals).values({
        id: randomUUID(),
        assetId,
        clientId,
        state: "pending",
        reason:
          sbTask.status === "review"
            ? "In review — waiting on your decision."
            : "Edit finished and waiting for sign-off before it goes out.",
        dueAt: sbTask.going_out_date ? new Date(`${sbTask.going_out_date}T09:00:00`) : null,
        createdAt: sbTask.updated_at ? new Date(sbTask.updated_at) : createdAt,
      });
      approvalCount += 1;
    }

    // Going-out dates are the publishing calendar.
    const goingOut = sbTask.going_out_date ?? sbTask.due_date;
    if (goingOut) {
      await db.insert(scheduledPosts).values({
        id: randomUUID(),
        clientId,
        taskId,
        platform: platformFor(sbTask.title, cadence),
        title: sbTask.title,
        scheduledAt: new Date(`${goingOut}T10:00:00`),
        state:
          sbTask.status === "approved"
            ? "scheduled"
            : sbTask.status === "done"
              ? "ready"
              : "planned",
      });
      postCount += 1;
    }
  }

  // Activity becomes the task thread. System lines are kept but attributed to
  // the person who caused them, so the history stays readable.
  let commentCount = 0;
  for (const activity of sbActivity) {
    const taskId = taskIdMap.get(activity.task_id);
    const sbTask = taskById.get(activity.task_id);
    if (!taskId || !sbTask?.client_id) continue;
    const clientId = clientIdMap.get(sbTask.client_id)!;
    const boardId = boardIdByClient.get(sbTask.client_id)!;
    const authorId =
      (activity.user_id && contributorIdFor.get(`${clientId}:${activity.user_id}`)) ||
      contributorIdFor.get(`${clientId}:${sbTask.created_by}`);
    if (!authorId) continue;

    await db.insert(comments).values({
      id: randomUUID(),
      taskId,
      boardId,
      authorId,
      content: isSystemActivity(activity.text) ? `— ${activity.text}` : activity.text,
      createdAt: new Date(activity.created_at),
    });
    commentCount += 1;
  }

  console.log(
    `Imported ${sbClients.length} clients, ${taskIdMap.size} tasks, ${approvalCount} approvals, ${postCount} scheduled posts, ${commentCount} comments.`,
  );
  console.log(`Founder login: ${FOUNDER_EMAIL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
