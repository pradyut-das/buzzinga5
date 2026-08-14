import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assets,
  boards,
  broadcasts,
  clients,
  comments,
  communities,
  docBlocks,
  docs,
  searchBlocks,
  tasks,
  topics,
  type SearchSourceType,
} from "@/db/schema";
import { flattenDocBlocks, htmlToPlainText } from "./text";
import { rawClient } from "@/db";
import { deleteEmbedding, embedText, ensureSearchVector, writeEmbedding } from "./vector";

/**
 * Keeps the block-search index in step with the source tables.
 *
 * One `search_blocks` row per searchable unit (a task's title, one block of a
 * task doc, one comment, an asset, a topic, a community, a broadcast or a
 * client). Rows carry deterministic ids so a re-index is a clean delete+insert,
 * and a `content_hash` so embeddings are only re-computed for what changed.
 *
 * Callers treat these as fire-and-forget: every function catches its own
 * failures and returns, so a broken index can never take down a write.
 */

interface RowInput {
  /** Deterministic id, stable across re-indexes of the same source. */
  id: string;
  blockId: string | null;
  blockIndex: number | null;
  boardId: string | null;
  clientId: string | null;
  taskId: string | null;
  docId?: string | null;
  sourceTitle: string;
  content: string;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Runs an async fn over items with a cap on concurrent work. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        await fn(items[index]!);
      } catch {
        // Individual embedding/index failures must not abort the batch.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Replaces every search row for one source with `rows`. Embeddings are kept in
 * step: new/changed content is embedded, rows that disappeared are dropped.
 */
async function replaceSource(
  sourceType: SearchSourceType,
  sourceId: string,
  rows: RowInput[],
): Promise<void> {
  const previous = await db
    .select({ id: searchBlocks.id, contentHash: searchBlocks.contentHash })
    .from(searchBlocks)
    .where(and(eq(searchBlocks.sourceType, sourceType), eq(searchBlocks.sourceId, sourceId)));
  const previousByKey = new Map(previous.map((row) => [row.id, row.contentHash]));

  await db
    .delete(searchBlocks)
    .where(and(eq(searchBlocks.sourceType, sourceType), eq(searchBlocks.sourceId, sourceId)));

  if (rows.length === 0) {
    await mapLimit([...previousByKey.keys()], 4, (id) => deleteEmbedding(id).catch(() => {}));
    return;
  }

  await db.insert(searchBlocks).values(
    rows.map((row) => ({
      id: row.id,
      sourceType,
      sourceId,
      blockId: row.blockId,
      blockIndex: row.blockIndex,
      boardId: row.boardId,
      clientId: row.clientId,
      taskId: row.taskId,
      docId: row.docId ?? null,
      sourceTitle: row.sourceTitle,
      content: row.content,
      contentHash: hash(row.content),
      indexedAt: new Date(),
    })),
  );

  if (!(await ensureSearchVector())) return;

  // Re-embed rows whose content changed AND rows that somehow have no
  // embedding yet (e.g. after a model swap), so a re-index always converges.
  const embeddingRows = await rawClient
    .execute(`SELECT id FROM search_embeddings`)
    .catch(() => null);
  const embedded = new Set(
    (embeddingRows?.rows ?? []).map((row) => (row as unknown as { id: string }).id),
  );

  const changed = rows.filter(
    (row) => previousByKey.get(row.id) !== hash(row.content) || !embedded.has(row.id),
  );
  await mapLimit(changed, 4, async (row) => {
    const vector = await embedText(row.content);
    if (vector) await writeEmbedding(row.id, vector);
  });

  const removed = [...previousByKey.keys()].filter((id) => !rows.some((row) => row.id === id));
  await mapLimit(removed, 4, (id) => deleteEmbedding(id).catch(() => {}));
}

/** Removes every search row (and embeddings) for a source. */
export async function removeSource(sourceType: SearchSourceType, sourceId: string): Promise<void> {
  await replaceSource(sourceType, sourceId, []);
}

function textOf(possibleJson: string | null | undefined): string {
  if (!possibleJson) return "";
  const trimmed = possibleJson.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.join(", ").trim();
    } catch {
      // Fall through to plain text.
    }
  }
  return trimmed;
}

async function clientForBoard(boardId: string): Promise<string | null> {
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
    columns: { clientId: true },
  });
  return board?.clientId ?? null;
}

// ── Per-source indexers ───────────────────────────────────────────────────

export async function indexTask(taskId: string): Promise<void> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (!task) {
    await removeSource("task_title", taskId);
    await removeSource("task_block", taskId);
    return;
  }
  const clientId = task.clientId ?? (await clientForBoard(task.boardId));
  const shared = { boardId: task.boardId, clientId, taskId };

  await replaceSource("task_title", taskId, [
    {
      id: `task_title:${taskId}`,
      blockId: null,
      blockIndex: null,
      ...shared,
      sourceTitle: task.title,
      content: task.title,
    },
  ]);

  const blocks = flattenDocBlocks(task.doc ?? "");
  await replaceSource(
    "task_block",
    taskId,
    blocks.map((block) => ({
      id: `task_block:${taskId}:${block.blockId ?? block.blockIndex}`,
      blockId: block.blockId,
      blockIndex: block.blockIndex,
      ...shared,
      sourceTitle: task.title,
      content: block.text,
    })),
  );
}

/**
 * Indexes a doc: one row for its title, one per persisted block.
 *
 * Blocks come from `doc_blocks` rather than being re-flattened from JSON, so a
 * search hit carries the same stable block id the editor and deep links use.
 */
export async function indexDoc(docId: string): Promise<void> {
  const doc = await db.query.docs.findFirst({ where: eq(docs.id, docId) });
  if (!doc || doc.archivedAt) {
    await removeSource("doc_title", docId);
    await removeSource("doc_block", docId);
    return;
  }

  const shared = {
    boardId: null,
    clientId: doc.clientId,
    taskId: doc.taskId,
    docId,
  };

  await replaceSource("doc_title", docId, [
    {
      id: `doc_title:${docId}`,
      blockId: null,
      blockIndex: null,
      ...shared,
      sourceTitle: doc.title,
      content: doc.title,
    },
  ]);

  const blocks = await db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.docId, docId))
    .orderBy(asc(docBlocks.position));

  await replaceSource(
    "doc_block",
    docId,
    blocks
      .filter((block) => block.text.trim().length > 0)
      .map((block) => ({
        id: `doc_block:${docId}:${block.id}`,
        blockId: block.id,
        blockIndex: block.position,
        ...shared,
        sourceTitle: doc.title,
        content: block.text,
      })),
  );
}

/** Drops a deleted doc from the index, title and blocks together. */
export async function removeDoc(docId: string): Promise<void> {
  await removeSource("doc_title", docId);
  await removeSource("doc_block", docId);
}

export async function indexComment(commentId: string): Promise<void> {
  const comment = await db.query.comments.findFirst({ where: eq(comments.id, commentId) });
  if (!comment) {
    await removeSource("comment", commentId);
    return;
  }
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, comment.taskId),
    columns: { title: true },
  });
  const flattened = flattenDocBlocks(comment.content);
  const content = flattened[0]?.text ?? htmlToPlainText(comment.content);
  if (!content) {
    await removeSource("comment", commentId);
    return;
  }
  await replaceSource("comment", commentId, [
    {
      id: `comment:${commentId}`,
      blockId: null,
      blockIndex: null,
      boardId: comment.boardId,
      clientId: await clientForBoard(comment.boardId),
      taskId: comment.taskId,
      sourceTitle: task?.title ?? "Comment",
      content,
    },
  ]);
}

export async function indexAsset(assetId: string): Promise<void> {
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
  if (!asset) {
    await removeSource("asset", assetId);
    return;
  }
  const content = [asset.title, asset.body, asset.transcript, asset.originalName]
    .filter(Boolean)
    .join("\n");
  await replaceSource("asset", assetId, [
    {
      id: `asset:${assetId}`,
      blockId: null,
      blockIndex: null,
      boardId: null,
      clientId: asset.clientId,
      taskId: asset.taskId,
      sourceTitle: asset.title,
      content,
    },
  ]);
}

export async function indexTopic(topicId: string): Promise<void> {
  const topic = await db.query.topics.findFirst({ where: eq(topics.id, topicId) });
  if (!topic) {
    await removeSource("topic", topicId);
    return;
  }
  const content = [topic.title, topic.evidence].filter(Boolean).join("\n");
  await replaceSource("topic", topicId, [
    {
      id: `topic:${topicId}`,
      blockId: null,
      blockIndex: null,
      boardId: null,
      clientId: topic.clientId,
      taskId: null,
      sourceTitle: topic.title,
      content,
    },
  ]);
}

export async function indexCommunity(communityId: string): Promise<void> {
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
  });
  if (!community) {
    await removeSource("community", communityId);
    return;
  }
  await replaceSource("community", communityId, [
    {
      id: `community:${communityId}`,
      blockId: null,
      blockIndex: null,
      boardId: null,
      clientId: community.clientId,
      taskId: null,
      sourceTitle: community.name,
      content: community.name,
    },
  ]);
}

export async function indexBroadcast(broadcastId: string): Promise<void> {
  const broadcast = await db.query.broadcasts.findFirst({
    where: eq(broadcasts.id, broadcastId),
  });
  if (!broadcast) {
    await removeSource("broadcast", broadcastId);
    return;
  }
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, broadcast.communityId),
    columns: { name: true, clientId: true },
  });
  await replaceSource("broadcast", broadcastId, [
    {
      id: `broadcast:${broadcastId}`,
      blockId: null,
      blockIndex: null,
      boardId: null,
      clientId: community?.clientId ?? null,
      taskId: null,
      sourceTitle: community?.name ?? "Broadcast",
      content: broadcast.body,
    },
  ]);
}

export async function indexClient(clientId: string): Promise<void> {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) {
    await removeSource("client", clientId);
    return;
  }
  const content = [
    client.name,
    client.voiceGuide,
    client.cadence,
    textOf(client.bannedPhrases),
    client.contact,
  ]
    .filter(Boolean)
    .join("\n");
  await replaceSource("client", clientId, [
    {
      id: `client:${clientId}`,
      blockId: null,
      blockIndex: null,
      boardId: null,
      clientId,
      taskId: null,
      sourceTitle: client.name,
      content,
    },
  ]);
}

// ── Orchestration ─────────────────────────────────────────────────────────

export interface ReindexSummary {
  sources: number;
  failed: number;
}

/**
 * Rebuilds the whole index from the source tables. Used by the backfill script
 * and the auth-gated reindex endpoint; each source is isolated so one bad row
 * cannot abort the rest.
 */
export async function reindexAll(): Promise<ReindexSummary> {
  await db.delete(searchBlocks);
  if (await ensureSearchVector()) {
    await rawClient.execute("DELETE FROM search_embeddings").catch(() => {});
  }

  const summary: ReindexSummary = { sources: 0, failed: 0 };
  const guard = async (fn: () => Promise<void>) => {
    try {
      await fn();
      summary.sources += 1;
    } catch {
      summary.failed += 1;
    }
  };

  for (const row of await db.select({ id: tasks.id }).from(tasks))
    await guard(() => indexTask(row.id));
  for (const row of await db.select({ id: comments.id }).from(comments))
    await guard(() => indexComment(row.id));
  for (const row of await db.select({ id: assets.id }).from(assets))
    await guard(() => indexAsset(row.id));
  for (const row of await db.select({ id: topics.id }).from(topics))
    await guard(() => indexTopic(row.id));
  for (const row of await db.select({ id: communities.id }).from(communities))
    await guard(() => indexCommunity(row.id));
  for (const row of await db.select({ id: broadcasts.id }).from(broadcasts))
    await guard(() => indexBroadcast(row.id));
  for (const row of await db.select({ id: clients.id }).from(clients))
    await guard(() => indexClient(row.id));

  return summary;
}
