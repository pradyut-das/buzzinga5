import { and, asc, desc, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import {
  boardMembers,
  clients,
  columns,
  comments,
  docBlocks,
  docs,
  contributors,
  tags,
  taskAssignees,
  taskStakeholders,
  taskTags,
  tasks,
  users,
  type TaskPriority,
} from "@/db/schema";
import {
  AgentError,
  didYouMean,
  resolveBoard,
  resolveColumn,
  type AgentScope,
} from "@/lib/agent/scope";
import { classifyColumn, getDashboardStats, isOpenKind } from "@/lib/agent/stats";
import { plainTextFromContent } from "@/lib/agent/text";
import {
  semanticSearch,
  toAgentHits,
  TASK_SOURCE_TYPES,
  DOC_SOURCE_TYPES,
  type SearchSourceType,
} from "@/lib/search/semantic";

/** Every read tool takes plain names, never ids — the model never sees UUIDs. */
export interface SearchTasksInput {
  boardName?: string | null;
  titleContains?: string | null;
  columnName?: string | null;
  priorities?: TaskPriority[] | null;
  assigneeName?: string | null;
  tagName?: string | null;
  unassigned?: boolean | null;
  onlyOpen?: boolean | null;
  staleDays?: number | null;
  /** Only tasks due on or before this YYYY-MM-DD date. */
  dueBefore?: string | null;
  /** Only tasks whose due date has already passed. */
  overdue?: boolean | null;
  /** true for tasks that carry a due date, false for those that do not. */
  hasDueDate?: boolean | null;
  limit?: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface TaskShape {
  title: string;
  board: string;
  column: string;
  columnKind: string;
  priority: TaskPriority;
  assignees: string[];
  stakeholders: string[];
  tags: string[];
  comments: number;
  dueAt: string | null;
  /** Days until the due date; negative once it has passed. Null when unset. */
  dueInDays: number | null;
  createdAt: string | null;
  lastActivityAt: string | null;
  idleDays: number;
  /**
   * How the text query reached this row: its title contained the words, the
   * semantic index suggested it, or both. Absent when no text query was given.
   * A "meaning"-only row is a candidate to confirm, not an established answer.
   */
  matchedBy?: "title" | "meaning" | "both";
}

/**
 * Task search is the workhorse behind almost every spoken question, so it takes
 * the union of every filter the dashboard itself can express.
 */
export async function searchTasks(scope: AgentScope, input: SearchTasksInput) {
  const boardIds = input.boardName ? [resolveBoard(scope, input.boardName).id] : scope.boardIds;
  if (!boardIds.length) return { total: 0, returned: 0, tasks: [] as TaskShape[] };

  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);

  // Text matching always runs both ways. A spoken phrase rarely quotes a
  // title, so the substring hit and the semantic neighbourhood are unioned
  // rather than tried in order — the index contributes candidates even when
  // the literal words did match, since the better answer is often the one
  // whose brief is about this and whose title is not.
  let rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.boardId, boardIds),
        input.titleContains ? like(tasks.title, `%${input.titleContains}%`) : undefined,
      ),
    );

  const literalIds = new Set(rows.map((task) => task.id));
  const meaningIds = new Set<string>();

  if (input.titleContains) {
    const { rows: hits } = await semanticSearch({
      query: input.titleContains,
      boardIds,
      sourceTypes: [...TASK_SOURCE_TYPES],
      limit: 25,
    });
    for (const hit of hits) {
      if (hit.row.taskId) meaningIds.add(hit.row.taskId);
    }

    const extra = [...meaningIds].filter((id) => !literalIds.has(id));
    if (extra.length) {
      const semanticRows = await db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.boardId, boardIds), inArray(tasks.id, extra)));
      // Literal hits first: they are the safer reading of what was asked.
      rows = [...rows, ...semanticRows];
    }
  }

  const [
    columnRows,
    assigneeRows,
    stakeholderRows,
    tagLinkRows,
    tagRows,
    contributorRows,
    commentRows,
  ] = await Promise.all([
    db.select().from(columns).where(inArray(columns.boardId, boardIds)),
    db.select().from(taskAssignees),
    db.select().from(taskStakeholders),
    db.select().from(taskTags),
    db.select().from(tags).where(inArray(tags.boardId, boardIds)),
    db.select().from(contributors).where(inArray(contributors.boardId, boardIds)),
    db.select().from(comments).where(inArray(comments.boardId, boardIds)),
  ]);

  const columnById = new Map(columnRows.map((c) => [c.id, c]));
  const contributorById = new Map(contributorRows.map((c) => [c.id, c]));
  const tagById = new Map(tagRows.map((t) => [t.id, t]));
  const boardTitle = new Map(scope.boards.map((b) => [b.id, b.title]));
  const now = new Date();

  const nameOf = (id: string) => contributorById.get(id)?.name ?? "Unknown";
  const namesFor = (taskId: string, links: { taskId: string; contributorId: string }[]) =>
    links.filter((link) => link.taskId === taskId).map((link) => nameOf(link.contributorId));

  let shaped: TaskShape[] = rows.map((task) => {
    const column = columnById.get(task.columnId);
    const taskComments = commentRows.filter((comment) => comment.taskId === task.id);
    const lastComment = taskComments
      .map((comment) => comment.createdAt?.getTime() ?? 0)
      .reduce((max, value) => Math.max(max, value), 0);
    const lastActivity = Math.max(lastComment, task.createdAt?.getTime() ?? 0);
    const literal = literalIds.has(task.id);
    const meaning = meaningIds.has(task.id);
    return {
      matchedBy: !input.titleContains
        ? undefined
        : literal && meaning
          ? ("both" as const)
          : literal
            ? ("title" as const)
            : ("meaning" as const),
      title: task.title,
      board: boardTitle.get(task.boardId) ?? "Board",
      column: column?.name ?? "Unknown",
      columnKind: column ? classifyColumn(column.name) : "active",
      priority: task.priority,
      assignees: namesFor(task.id, assigneeRows),
      stakeholders: namesFor(task.id, stakeholderRows),
      tags: tagLinkRows
        .filter((link) => link.taskId === task.id)
        .map((link) => tagById.get(link.tagId)?.name ?? "")
        .filter(Boolean),
      comments: taskComments.length,
      dueAt: task.dueAt?.toISOString() ?? null,
      dueInDays: task.dueAt ? Math.ceil((task.dueAt.getTime() - now.getTime()) / DAY_MS) : null,
      createdAt: task.createdAt?.toISOString() ?? null,
      lastActivityAt: lastActivity ? new Date(lastActivity).toISOString() : null,
      idleDays: lastActivity ? Math.floor((now.getTime() - lastActivity) / DAY_MS) : 0,
    };
  });

  if (input.columnName) {
    const needle = input.columnName
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim();
    shaped = shaped.filter((task) =>
      task.column
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .trim()
        .includes(needle),
    );
  }
  if (input.priorities?.length) {
    shaped = shaped.filter((task) => input.priorities?.includes(task.priority));
  }
  if (input.assigneeName) {
    const needle = input.assigneeName.toLowerCase();
    shaped = shaped.filter((task) =>
      task.assignees.some((name) => name.toLowerCase().includes(needle)),
    );
  }
  if (input.tagName) {
    const needle = input.tagName.toLowerCase();
    shaped = shaped.filter((task) => task.tags.some((name) => name.toLowerCase().includes(needle)));
  }
  if (input.unassigned) shaped = shaped.filter((task) => task.assignees.length === 0);
  if (input.onlyOpen) {
    shaped = shaped.filter((task) => isOpenKind(task.columnKind as "active"));
  }
  if (input.staleDays !== null && input.staleDays !== undefined) {
    shaped = shaped.filter((task) => task.idleDays >= (input.staleDays ?? 0));
  }
  if (input.hasDueDate !== null && input.hasDueDate !== undefined) {
    shaped = shaped.filter((task) => (task.dueAt !== null) === input.hasDueDate);
  }
  if (input.overdue)
    shaped = shaped.filter((task) => task.dueInDays !== null && task.dueInDays < 0);
  if (input.dueBefore) {
    const cutoff = new Date(`${input.dueBefore.slice(0, 10)}T23:59:59`).getTime();
    if (Number.isNaN(cutoff)) throw new AgentError(`"${input.dueBefore}" is not a real date.`);
    shaped = shaped.filter(
      (task) => task.dueAt !== null && new Date(task.dueAt).getTime() <= cutoff,
    );
  }

  shaped.sort((a, b) => b.idleDays - a.idleDays);
  return {
    total: shaped.length,
    returned: Math.min(shaped.length, limit),
    tasks: shaped.slice(0, limit),
  };
}

/** Full state of exactly one task, resolved by title inside the scope. */
export async function getTaskDetails(
  scope: AgentScope,
  taskTitle: string,
  boardName?: string | null,
) {
  const result = await searchTasks(scope, { boardName, titleContains: taskTitle, limit: 6 });
  const exact = result.tasks.filter(
    (task) => task.title.toLowerCase() === taskTitle.trim().toLowerCase(),
  );
  const candidates = exact.length ? exact : result.tasks;
  if (!candidates.length) throw new AgentError(`No task matching "${taskTitle}".`);
  if (candidates.length > 1) {
    throw new AgentError(
      `"${taskTitle}" matches several tasks: ${candidates.map((t) => `${t.title} (${t.board})`).join("; ")}. Which one?`,
    );
  }
  // The row carries how it was matched, so a paraphrased hit gets confirmed
  // rather than assumed.
  return candidates[0];
}

export async function listBoards(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return { boards: stats.boards };
}

export async function listColumns(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db
    .select()
    .from(columns)
    .where(eq(columns.boardId, board.id))
    .orderBy(columns.position);
  const counts = await db.select().from(tasks).where(eq(tasks.boardId, board.id));
  return {
    board: board.title,
    columns: rows.map((column) => ({
      name: column.name,
      position: column.position,
      kind: classifyColumn(column.name),
      collapsed: Boolean(column.isCollapsed),
      tasks: counts.filter((task) => task.columnId === column.id).length,
    })),
  };
}

export async function listContributors(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db.select().from(contributors).where(eq(contributors.boardId, board.id));
  const assignments = await db.select().from(taskAssignees);
  return {
    board: board.title,
    contributors: rows.map((contributor) => ({
      name: contributor.name,
      email: contributor.email,
      color: contributor.color,
      assignedTasks: assignments.filter((link) => link.contributorId === contributor.id).length,
    })),
  };
}

export async function listTags(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db.select().from(tags).where(eq(tags.boardId, board.id));
  const links = await db.select().from(taskTags);
  return {
    board: board.title,
    tags: rows.map((tag) => ({
      name: tag.name,
      color: tag.color,
      tasks: links.filter((link) => link.tagId === tag.id).length,
    })),
  };
}

/**
 * Collaborators are user accounts with a membership row — distinct from
 * contributors, who are board-local people that work can be assigned to.
 */
export async function listCollaborators(scope: AgentScope, boardName?: string | null) {
  const board = resolveBoard(scope, boardName);
  const rows = await db
    .select({ name: users.name, email: users.email, role: boardMembers.role })
    .from(boardMembers)
    .innerJoin(users, eq(users.id, boardMembers.userId))
    .where(eq(boardMembers.boardId, board.id));
  return { board: board.title, collaborators: rows };
}

export async function getTaskComments(
  scope: AgentScope,
  taskTitle: string,
  boardName?: string | null,
) {
  const boardIds = boardName ? [resolveBoard(scope, boardName).id] : scope.boardIds;
  let matches = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.boardId, boardIds), like(tasks.title, `%${taskTitle}%`)));

  // Meaning is consulted every time, not only on a miss: "what did people say
  // about the pricing one" should reach the task whose brief is about pricing.
  const { rows: hits } = await semanticSearch({
    query: taskTitle,
    boardIds,
    sourceTypes: [...TASK_SOURCE_TYPES],
    limit: 6,
  });
  const literal = new Set(matches.map((task) => task.id));
  const extra = [...new Set(hits.map((hit) => hit.row.taskId).filter(Boolean))].filter(
    (id) => id && !literal.has(id),
  ) as string[];
  if (extra.length) {
    const semanticRows = await db
      .select()
      .from(tasks)
      .where(and(inArray(tasks.boardId, boardIds), inArray(tasks.id, extra)));
    matches = [...matches, ...semanticRows];
  }
  if (!matches.length) throw new AgentError(`No task matching "${taskTitle}".`);
  if (matches.length > 1) {
    throw new AgentError(
      `"${taskTitle}" matches several tasks: ${matches.map((t) => t.title).join("; ")}. Which one?`,
    );
  }

  const task = matches[0];
  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.taskId, task.id))
    .orderBy(desc(comments.createdAt))
    .limit(20);
  const people = await db.select().from(contributors).where(eq(contributors.boardId, task.boardId));
  const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "Someone";

  return {
    task: task.title,
    comments: rows.map((comment) => ({
      author: nameOf(comment.authorId),
      stakeholder: comment.stakeholderId ? nameOf(comment.stakeholderId) : null,
      text: plainTextFromContent(comment.content).slice(0, 600),
      createdAt: comment.createdAt?.toISOString() ?? null,
    })),
  };
}

export async function getRecentActivity(scope: AgentScope, limit?: number | null) {
  const stats = await getDashboardStats(scope);
  return { activity: stats.activity.slice(0, Math.min(Math.max(limit ?? 10, 1), 12)) };
}

export async function getWorkload(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return { workload: stats.workload, unassigned: stats.totals.unassigned };
}

export async function getRisks(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return {
    risks: stats.risks,
    blocked: stats.totals.blocked,
    stale: stats.totals.stale,
    unassigned: stats.totals.unassigned,
  };
}

export async function getVelocity(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return { velocity: stats.velocity, doneThisWeek: stats.totals.doneThisWeek };
}

/** The exact numbers rendered on the homepage, so answers never drift from it. */
export async function getPulse(scope: AgentScope) {
  const stats = await getDashboardStats(scope);
  return {
    generatedAt: stats.generatedAt,
    totals: stats.totals,
    health: stats.health,
    pipeline: stats.pipeline,
    priorityMix: stats.priorityMix,
    topPriority: stats.topPriority,
  };
}

/** Board-scoped column preview used before a move, so positions stay sane. */
export async function previewColumn(
  scope: AgentScope,
  boardName: string | null,
  columnName: string,
) {
  const board = resolveBoard(scope, boardName);
  const column = await resolveColumn(board.id, columnName);
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.columnId, column.id))
    .orderBy(tasks.position);
  return {
    board: board.title,
    column: column.name,
    tasks: rows.map((task, index) => ({
      position: index,
      title: task.title,
      priority: task.priority,
    })),
  };
}

// ── Semantic search ───────────────────────────────────────────────────────

export interface SemanticSearchToolInput {
  query: string;
  clientName?: string | null;
  boardName?: string | null;
  kinds?: SearchSourceType[] | null;
  limit?: number | null;
}

/**
 * Meaning-based search over everything the user's boards contain. The scope is
 * board membership, same as every other read tool, so a semantic neighbour on
 * someone else's board can never leak into an answer.
 */
export async function semanticSearchTool(scope: AgentScope, input: SemanticSearchToolInput) {
  const query = input.query?.trim();
  if (!query) throw new AgentError("Say what to search for.");

  const boardIds = input.boardName ? [resolveBoard(scope, input.boardName).id] : scope.boardIds;
  if (!boardIds.length) return { query, returned: 0, hits: [] };

  // Clients are named, not id'd, in every agent-facing surface.
  let clientId: string | null = null;
  if (input.clientName) {
    const wanted = input.clientName.trim().toLowerCase();
    const rows = await db.select({ id: clients.id, name: clients.name }).from(clients);
    const match =
      rows.find((row) => row.name.toLowerCase() === wanted) ??
      rows.find((row) => row.name.toLowerCase().includes(wanted));
    if (!match) {
      throw new AgentError(
        `No client called "${input.clientName}". Known clients: ${rows
          .map((row) => row.name)
          .join(", ")}.`,
      );
    }
    clientId = match.id;
  }

  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  const { rows, vectorEnabled } = await semanticSearch({
    query,
    boardIds,
    clientId,
    sourceTypes: input.kinds ?? undefined,
    limit,
  });

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = toAgentHits(rows, terms);

  // Titles read better than ids in a spoken answer, so resolve them here.
  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const clientNameById = new Map(clientRows.map((row) => [row.id, row.name]));

  return {
    query,
    /** False when embeddings are unavailable, so the model can say so. */
    semanticAvailable: vectorEnabled,
    returned: hits.length,
    hits: hits.map((hit) => ({
      kind: hit.kind,
      title: hit.title,
      snippet: hit.snippet,
      client: hit.clientId ? (clientNameById.get(hit.clientId) ?? null) : null,
      matchedBy: hit.matchedBy,
    })),
  };
}

// ── Docs ──────────────────────────────────────────────────────────────────

/**
 * Docs are searched on their own, never mixed into task results. A doc is
 * writing that belongs to a client; a task is work on a board. Answering one
 * question with the other is the confusion this separation exists to prevent.
 */
export async function searchDocs(
  scope: AgentScope,
  input: { query: string; clientName?: string | null; limit?: number | null },
) {
  const query = input.query?.trim();
  if (!query) throw new AgentError("Say what to search the docs for.");

  const clientId = input.clientName ? resolveClient(scope, input.clientName).id : null;
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);

  const { rows, vectorEnabled } = await semanticSearch({
    query,
    clientId,
    sourceTypes: [...DOC_SOURCE_TYPES],
    limit,
  });

  const docIds = [...new Set(rows.map((row) => row.row.docId).filter(Boolean))] as string[];
  const docRows = docIds.length ? await db.select().from(docs).where(inArray(docs.id, docIds)) : [];
  const docById = new Map(docRows.map((row) => [row.id, row]));
  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const clientNameById = new Map(clientRows.map((row) => [row.id, row.name]));

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return {
    query,
    semanticAvailable: vectorEnabled,
    returned: rows.length,
    hits: toAgentHits(rows, terms).map((hit) => {
      const doc = hit.docId ? docById.get(hit.docId) : undefined;
      return {
        docTitle: doc?.title ?? hit.title,
        /** "doc_title" matched the name, "doc_block" matched text inside it. */
        matchedIn: hit.kind === "doc_title" ? "title" : "body",
        snippet: hit.snippet,
        client: doc?.clientId ? (clientNameById.get(doc.clientId) ?? null) : null,
        matchedBy: hit.matchedBy,
      };
    }),
  };
}

/** Resolves a spoken client name to exactly one client. */
/**
 * Resolves whatever the model passed — an id straight from the directory, or a
 * spoken name — to exactly one client the user can act on.
 *
 * The directory ships every client's id, so the model should pass the id and
 * this is a lookup. A name is still accepted because speech does not carry ids,
 * and it is matched only within the user's own clients.
 */
export function resolveClient(scope: AgentScope, nameOrId: string) {
  const wanted = nameOrId.trim().toLowerCase();
  const known = scope.clients;
  if (!known.length) {
    throw new AgentError("You are not a member of any client's board yet.");
  }

  const byId = known.find((client) => client.id.toLowerCase() === wanted);
  if (byId) return byId;

  const exact = known.filter((client) => client.name.toLowerCase() === wanted);
  if (exact.length === 1) return exact[0];

  const partial = known.filter((client) => client.name.toLowerCase().includes(wanted));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    throw new AgentError(
      `"${nameOrId}" matches several clients: ${partial.map((c) => c.name).join(", ")}. Which one?`,
    );
  }

  const names = known.map((client) => client.name);
  throw new AgentError(
    `No client called "${nameOrId}".${didYouMean(nameOrId, names)} Your clients are: ${names.join(", ")}.`,
  );
}

/** Lists a client's docs by name, so the model can offer real titles. */
export async function listDocsTool(
  scope: AgentScope,
  input: { clientName?: string | null; limit?: number | null },
) {
  const clientId = input.clientName ? resolveClient(scope, input.clientName).id : null;
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);

  const rows = await db
    .select()
    .from(docs)
    .where(
      clientId
        ? and(eq(docs.clientId, clientId), isNull(docs.archivedAt))
        : isNull(docs.archivedAt),
    )
    .orderBy(asc(docs.title));

  const clientRows = await db.select({ id: clients.id, name: clients.name }).from(clients);
  const clientNameById = new Map(clientRows.map((row) => [row.id, row.name]));
  const blockCounts = await db.select({ docId: docBlocks.docId, id: docBlocks.id }).from(docBlocks);
  const countByDoc = new Map<string, number>();
  for (const row of blockCounts) {
    countByDoc.set(row.docId, (countByDoc.get(row.docId) ?? 0) + 1);
  }

  return {
    total: rows.length,
    returned: Math.min(rows.length, limit),
    docs: rows.slice(0, limit).map((doc) => ({
      title: doc.title,
      client: clientNameById.get(doc.clientId) ?? null,
      blocks: countByDoc.get(doc.id) ?? 0,
      updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
    })),
  };
}

/** Reads one doc's text back, block by block, resolved by title. */
export async function readDoc(
  scope: AgentScope,
  input: { docTitle: string; clientName?: string | null },
) {
  const doc = await resolveDocByTitle(scope, input.docTitle, input.clientName);
  const blocks = await db
    .select()
    .from(docBlocks)
    .where(eq(docBlocks.docId, doc.id))
    .orderBy(asc(docBlocks.position));

  const client = await db.query.clients.findFirst({ where: eq(clients.id, doc.clientId) });
  return {
    title: doc.title,
    client: client?.name ?? null,
    updatedAt: doc.updatedAt ? doc.updatedAt.toISOString() : null,
    blocks: blocks.map((block) => ({
      position: block.position,
      type: block.type,
      level: block.level,
      text: block.text,
    })),
  };
}

/**
 * Resolves a doc by title, consulting meaning as well as wording so a spoken
 * description reaches the right document.
 */
export async function resolveDocByTitle(
  scope: AgentScope,
  docTitle: string,
  clientName?: string | null,
) {
  const clientId = clientName ? resolveClient(scope, clientName).id : null;
  const all = await db
    .select()
    .from(docs)
    .where(
      clientId
        ? and(eq(docs.clientId, clientId), isNull(docs.archivedAt))
        : isNull(docs.archivedAt),
    );

  const needle = docTitle.trim().toLowerCase();
  const exact = all.filter((doc) => doc.title.toLowerCase() === needle);
  const partial = all.filter((doc) => doc.title.toLowerCase().includes(needle));
  const candidates = exact.length ? exact : partial;

  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    throw new AgentError(
      `"${docTitle}" matches several docs: ${candidates.map((doc) => doc.title).join("; ")}. Which one?`,
    );
  }

  // Nothing matched by wording, so ask the index what this sounds like.
  const { rows } = await semanticSearch({
    query: docTitle,
    clientId,
    sourceTypes: [...DOC_SOURCE_TYPES],
    limit: 6,
  });
  const suggested: string[] = [];
  const byId = new Map(all.map((doc) => [doc.id, doc]));
  for (const row of rows) {
    const doc = row.row.docId ? byId.get(row.row.docId) : undefined;
    if (doc && !suggested.includes(doc.title)) suggested.push(doc.title);
    if (suggested.length === 3) break;
  }
  throw new AgentError(
    suggested.length
      ? `No doc titled "${docTitle}". Closest by meaning: ${suggested.join("; ")}. Which one?`
      : `No doc matching "${docTitle}".`,
  );
}
