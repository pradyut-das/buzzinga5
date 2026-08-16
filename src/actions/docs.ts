"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { docBlocks, docs, clients, tasks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { currentContributorId } from "@/lib/auth/contributor";
import { queueDocNotification } from "@/lib/notifications";
import { indexDoc, removeDoc } from "@/lib/search/indexer";

/**
 * Docs are their own thing: writing that belongs to a client, not work that
 * belongs to a board. The one task a doc briefs is the only overlap, and it is
 * read here solely to find the people that task concerns.
 */

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Sign in first");
  return user;
}

function revalidateDocs(clientId: string, docId?: string) {
  revalidatePath("/docs");
  revalidatePath(`/clients/${clientId}`);
  if (docId) revalidatePath(`/clients/${clientId}/docs/${docId}`);
}

/** Plain text of one TipTap node, mentions flattened to @label. */
function nodeText(node: unknown): string {
  const parts: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const typed = value as {
      type?: string;
      text?: string;
      attrs?: { label?: string };
      content?: unknown;
    };
    if (typed.type === "text" && typeof typed.text === "string") parts.push(typed.text);
    if (typed.type === "mention" && typed.attrs?.label) parts.push(`@${typed.attrs.label}`);
    if (typed.content) walk(typed.content);
  };
  walk(node);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

interface ParsedBlock {
  position: number;
  type: string;
  level: number | null;
  text: string;
}

/** Splits a doc's TipTap JSON into the rows `doc_blocks` stores. */
function parseBlocks(content: string | null): ParsedBlock[] {
  if (!content?.trim().startsWith("{")) return [];
  try {
    const parsed = JSON.parse(content) as { type?: string; content?: unknown[] };
    if (parsed?.type !== "doc" || !Array.isArray(parsed.content)) return [];
    return parsed.content.map((node, position) => {
      const typed = node as { type?: string; attrs?: { level?: number } };
      return {
        position,
        type: typed?.type ?? "paragraph",
        level: typeof typed?.attrs?.level === "number" ? typed.attrs.level : null,
        text: nodeText(node),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Rewrites a doc's blocks, reusing the existing row id wherever a block is
 * recognisably the same one. Ids have to survive an edit: a deep link that
 * names a block should still resolve after a paragraph is inserted above it.
 *
 * Matching is by text first (a block that moved), then by position among rows
 * of the same type (a block that was edited in place). Anything unmatched is
 * new and gets a fresh id.
 */
async function writeBlocks(docId: string, content: string | null) {
  const parsed = parseBlocks(content);
  const existing = await db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.docId, docId))
    .orderBy(asc(docBlocks.position));

  const unclaimed = [...existing];
  const claim = (block: ParsedBlock): string => {
    const byText =
      block.text.length > 0
        ? unclaimed.findIndex((row) => row.text === block.text && row.type === block.type)
        : -1;
    const index =
      byText >= 0
        ? byText
        : unclaimed.findIndex((row) => row.type === block.type && row.position === block.position);
    if (index < 0) return randomUUID();
    const [row] = unclaimed.splice(index, 1);
    return row.id;
  };

  const rows = parsed.map((block) => ({ id: claim(block), docId, ...block }));

  await db.delete(docBlocks).where(eq(docBlocks.docId, docId));
  if (rows.length) await db.insert(docBlocks).values(rows);
  return rows.length;
}

/**
 * Tells a task's people that a doc now hangs off their task.
 *
 * A doc with no task is skipped: a notification row has to name a task, and a
 * loose doc has no roster to address.
 */
async function announceDoc(taskId: string | null, docId: string, docTitle: string) {
  if (!taskId) return;

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: { boardId: true },
  });
  if (!task) return;

  await queueDocNotification({
    boardId: task.boardId,
    taskId,
    docId,
    docTitle,
    createdById: await currentContributorId(task.boardId),
  });
}

export async function createDocument(input: {
  clientId: string;
  title: string;
  taskId?: string | null;
}) {
  const user = await requireUser();
  const title = input.title.trim();
  if (!title) throw new Error("A doc needs a title");

  const client = await db.query.clients.findFirst({ where: eq(clients.id, input.clientId) });
  if (!client) throw new Error("That client does not exist");

  const id = randomUUID();
  // Seed with the title as a heading so a new doc opens with something in it.
  const content = JSON.stringify({
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
      { type: "paragraph" },
    ],
  });

  await db.insert(docs).values({
    id,
    clientId: input.clientId,
    taskId: input.taskId ?? null,
    title,
    content,
    createdBy: user.id,
  });
  await writeBlocks(id, content);
  await announceDoc(input.taskId ?? null, id, title);
  void indexDoc(id);
  revalidateDocs(input.clientId, id);
  return id;
}

export async function saveDocument(docId: string, content: string) {
  await requireUser();
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc) throw new Error("Doc not found");

  await db.update(docs).set({ content, updatedAt: new Date() }).where(eq(docs.id, docId));
  await writeBlocks(docId, content);
  void indexDoc(docId);
  // No revalidate: the editor already holds the current text, and refreshing
  // the route under an open editor would fight the caret.
}

export async function renameDocument(docId: string, title: string) {
  await requireUser();
  const trimmed = title.trim();
  if (!trimmed) throw new Error("A doc needs a title");
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc) throw new Error("Doc not found");

  await db.update(docs).set({ title: trimmed, updatedAt: new Date() }).where(eq(docs.id, docId));
  void indexDoc(docId);
  revalidateDocs(doc.clientId, docId);
}

/** Links a doc to the one task it briefs, or clears the link with null. */
export async function setDocumentTask(docId: string, taskId: string | null) {
  await requireUser();
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc) throw new Error("Doc not found");
  await db.update(docs).set({ taskId, updatedAt: new Date() }).where(eq(docs.id, docId));
  // Only a new link is news; re-saving the same one is not.
  if (taskId && taskId !== doc.taskId) await announceDoc(taskId, docId, doc.title);
  revalidateDocs(doc.clientId, docId);
}

export async function deleteDocument(docId: string) {
  await requireUser();
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc) throw new Error("Doc not found");

  // Un-index BEFORE deleting the row, and await it. `indexDoc` reads the doc to
  // decide what to write, so once the row is gone a failed or racing index run
  // can no longer be cleaned up by id — the search rows and their embeddings
  // would outlive the doc and keep answering searches.
  await removeDoc(docId);
  // doc_blocks cascade with the doc.
  await db.delete(docs).where(eq(docs.id, docId));
  revalidateDocs(doc.clientId);
}

export async function listDocuments(clientId?: string) {
  await requireUser();
  const where = clientId
    ? and(eq(docs.clientId, clientId), isNull(docs.archivedAt))
    : isNull(docs.archivedAt);
  return db.select().from(docs).where(where).orderBy(asc(docs.title));
}
