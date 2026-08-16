/**
 * Drives the notification pipeline end to end against the dev database.
 *
 * The Playwright suite cannot cover this: it navigates to /boards/<id>, a page
 * route that no longer exists since the desk moved to /clients/..., so every
 * seeded test 404s before reaching any email code. This exercises the same
 * queue -> deliver path those tests were meant to.
 *
 * Read-write against the configured database. Everything it creates is removed
 * at the end, including on failure.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  boards,
  clients,
  columns,
  contributors,
  emailSendCounters,
  pendingNotifications,
  sentEmails,
  taskAssignees,
  taskCollaborators,
  taskStakeholders,
  tasks,
} from "@/db/schema";
import { getTaskRecipients, queueNotifications } from "@/lib/notifications";
import { deliverNotifications, processBoardNotifications } from "@/lib/process-board-notifications";
import { partitionByEmailQuota, recordEmailsSent } from "@/lib/email-rate-limit";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const ids = {
  client: randomUUID(),
  board: randomUUID(),
  column: randomUUID(),
  task: randomUUID(),
  assignee: randomUUID(),
  collaborator: randomUUID(),
  stakeholder: randomUUID(),
  actor: randomUUID(),
  noEmail: randomUUID(),
};

async function seed() {
  await db.insert(clients).values({
    id: ids.client,
    name: "Verify Client",
    initials: "VC",
  });
  await db.insert(boards).values({
    id: ids.board,
    clientId: ids.client,
    title: "Verify Board",
  });
  await db.insert(columns).values({
    id: ids.column,
    boardId: ids.board,
    name: "To do",
    position: 0,
  });
  await db.insert(tasks).values({
    id: ids.task,
    boardId: ids.board,
    columnId: ids.column,
    title: "Verify Task",
    position: 0,
  });
  await db.insert(contributors).values([
    { id: ids.assignee, boardId: ids.board, name: "Ana", email: "ana@example.test", color: "rose" },
    {
      id: ids.collaborator,
      boardId: ids.board,
      name: "Bo",
      email: "bo@example.test",
      color: "blue",
    },
    {
      id: ids.stakeholder,
      boardId: ids.board,
      name: "Cy",
      email: "cy@example.test",
      color: "teal",
    },
    { id: ids.actor, boardId: ids.board, name: "Dee", email: "dee@example.test", color: "amber" },
    { id: ids.noEmail, boardId: ids.board, name: "Eli", email: null, color: "lime" },
  ]);
  await db.insert(taskAssignees).values({ taskId: ids.task, contributorId: ids.assignee });
  await db.insert(taskCollaborators).values({ taskId: ids.task, contributorId: ids.collaborator });
  await db.insert(taskStakeholders).values([
    { taskId: ids.task, contributorId: ids.stakeholder },
    { taskId: ids.task, contributorId: ids.noEmail },
  ]);
}

async function cleanup() {
  await db.delete(sentEmails).where(eq(sentEmails.boardId, ids.board));
  await db.delete(pendingNotifications).where(eq(pendingNotifications.boardId, ids.board));
  await db.delete(emailSendCounters).where(
    inArray(
      emailSendCounters.subject,
      Object.values(ids).map((id) => `contributor:${id}`),
    ),
  );
  await db.delete(taskAssignees).where(eq(taskAssignees.taskId, ids.task));
  await db.delete(taskCollaborators).where(eq(taskCollaborators.taskId, ids.task));
  await db.delete(taskStakeholders).where(eq(taskStakeholders.taskId, ids.task));
  await db.delete(tasks).where(eq(tasks.id, ids.task));
  await db.delete(columns).where(eq(columns.id, ids.column));
  await db.delete(contributors).where(eq(contributors.boardId, ids.board));
  await db.delete(boards).where(eq(boards.id, ids.board));
  await db.delete(clients).where(eq(clients.id, ids.client));
}

async function main() {
  await seed();

  console.log("\nrecipients");
  const recipients = await getTaskRecipients(ids.task);
  check("includes the assignee", recipients.includes(ids.assignee));
  check("includes the collaborator", recipients.includes(ids.collaborator));
  check("includes the stakeholder", recipients.includes(ids.stakeholder));
  check("has no duplicates", recipients.length === new Set(recipients).size);

  console.log("\nqueueing");
  const queued = await queueNotifications({
    boardId: ids.board,
    taskId: ids.task,
    recipientIds: [...recipients, ids.actor],
    type: "status",
    triggeredById: ids.actor,
    metadata: { status: "in_production" },
  });
  check("returns the written row ids", queued.length > 0);
  const queuedRows = await db.query.pendingNotifications.findMany({
    where: inArray(pendingNotifications.id, queued),
  });
  check("does not address the actor", !queuedRows.some((r) => r.recipientId === ids.actor));
  check(
    "records the actor as triggeredBy",
    queuedRows.every((r) => r.triggeredById === ids.actor),
  );

  console.log("\ndelivery");
  const result = await processBoardNotifications(ids.board);
  check(
    "delivered to the three with an email",
    result.processed === 3,
    `processed=${result.processed}`,
  );
  check("skipped the one without", result.skippedNoEmail === 1, `skipped=${result.skippedNoEmail}`);
  check(
    "drained the queue",
    (
      await db.query.pendingNotifications.findMany({
        where: eq(pendingNotifications.boardId, ids.board),
      })
    ).length === 0,
  );

  const logged = await db.query.sentEmails.findMany({ where: eq(sentEmails.boardId, ids.board) });
  check("logged one email each", logged.length === 3, `logged=${logged.length}`);
  const sample = logged[0];
  check('names the actor, not "Someone"', Boolean(sample && sample.htmlContent.includes("Dee")));
  check(
    "renders the new status copy",
    Boolean(sample && sample.htmlContent.includes("in production")),
  );
  check(
    "carries an unsubscribe link",
    Boolean(sample && /\/api\/unsubscribe\?token=[\w-]+/.test(sample.htmlContent)),
  );

  console.log("\nunsubscribe");
  const token = sample?.htmlContent.match(/\/api\/unsubscribe\?token=([\w-]+)/)?.[1];
  check("minted a token", Boolean(token));
  const holder = await db.query.contributors.findFirst({
    where: eq(contributors.unsubscribeToken, token ?? "never"),
  });
  check("token resolves to a contributor", Boolean(holder));
  if (holder) {
    await db
      .update(contributors)
      .set({ unsubscribedAt: new Date() })
      .where(eq(contributors.id, holder.id));
    await queueNotifications({
      boardId: ids.board,
      taskId: ids.task,
      recipientIds: [holder.id],
      type: "move",
      metadata: { fromColumn: "To do", toColumn: "Doing" },
    });
    const after = await processBoardNotifications(ids.board);
    check("sends nothing once unsubscribed", after.processed === 0, `processed=${after.processed}`);
    check("drops the row rather than holding it", after.skippedNoEmail === 1);
  }

  console.log("\nrate limits");
  const capped = ids.collaborator;
  await recordEmailsSent(Array.from({ length: 6 }, () => capped));
  const { limited, allowed } = await partitionByEmailQuota([capped, ids.stakeholder]);
  check("holds back the capped recipient", limited.has(capped));
  check("lets an uncapped one through", allowed.has(ids.stakeholder));

  const heldIds = await queueNotifications({
    boardId: ids.board,
    taskId: ids.task,
    recipientIds: [capped],
    type: "priority",
    metadata: { priority: "urgent" },
  });
  const held = await processBoardNotifications(ids.board);
  check("does not email past the cap", held.processed === 0, `processed=${held.processed}`);
  check("reports it as rate limited", held.rateLimited === 1, `rateLimited=${held.rateLimited}`);
  const stillQueued = await db.query.pendingNotifications.findMany({
    where: inArray(pendingNotifications.id, heldIds),
  });
  check("leaves the rows queued for the next sweep", stillQueued.length === heldIds.length);

  console.log("\ninstant subject");
  // A fresh person: the earlier sections deliberately unsubscribed one
  // contributor and exhausted another's quota, and either would mask this.
  const newcomer = randomUUID();
  await db.insert(contributors).values({
    id: newcomer,
    boardId: ids.board,
    name: "Fay",
    email: "fay@example.test",
    color: "violet",
  });
  const assignIds = await queueNotifications({
    boardId: ids.board,
    taskId: ids.task,
    recipientIds: [newcomer],
    type: "assign",
    triggeredById: ids.actor,
  });
  const toDeliver = await db.query.pendingNotifications.findMany({
    where: inArray(pendingNotifications.id, assignIds),
    with: { recipient: true, triggeredBy: true, task: true, board: true },
  });
  await deliverNotifications(toDeliver, {
    subject: (items) => `You were assigned "${items[0]?.task.title}"`,
  });
  const assignEmail = (
    await db.query.sentEmails.findMany({ where: eq(sentEmails.boardId, ids.board) })
  ).find((e) => e.subject.startsWith("You were assigned"));
  check("uses the instant subject", Boolean(assignEmail));
}

main()
  .then(cleanup)
  .then(() => {
    console.log(failures === 0 ? "\nall checks passed\n" : `\n${failures} check(s) failed\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error("\nharness error:", error);
    await cleanup().catch(() => {});
    process.exit(1);
  });
