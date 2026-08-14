import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boards, clients, searchBlocks } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { indexClient, indexTask } from "@/lib/search/indexer";
import { buildSnippet, escapeHtml } from "@/lib/search/text";
import { semanticSearch } from "@/lib/search/semantic";

const LIMIT = 14;

export const dynamic = "force-dynamic";

/** Results deep-link into a client's own routes, so every row needs a client. */
async function resolveClient(row: typeof searchBlocks.$inferSelect): Promise<string | null> {
  if (row.clientId) return row.clientId;
  if (!row.boardId) return null;
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, row.boardId),
    columns: { clientId: true },
  });
  return board?.clientId ?? null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  await requireUser();

  const params = req.nextUrl.searchParams;
  const rawQuery = params.get("q")?.trim() ?? "";

  // Scope is optional: the palette searches everything, a client board narrows
  // to its own work.
  const { rows, vectorEnabled } = await semanticSearch({
    query: rawQuery,
    clientId: params.get("clientId"),
    boardId: params.get("boardId"),
    semantic: params.get("semantic") !== "0",
    limit: LIMIT,
  });

  const terms = rawQuery.toLowerCase().split(/\s+/).filter(Boolean);

  const results = await Promise.all(
    rows.map(async ({ row, matchedBy }) => {
      const clientId = await resolveClient(row);
      const clientName = clientId
        ? ((
            await db.query.clients.findFirst({
              where: eq(clients.id, clientId),
              columns: { name: true },
            })
          )?.name ?? null)
        : null;

      return {
        id: row.id,
        type: row.sourceType,
        title: escapeHtml(row.sourceTitle),
        snippet: buildSnippet(row.content, terms),
        sourceTitle: escapeHtml(row.sourceTitle),
        blockId: row.blockId,
        blockIndex: row.blockIndex,
        boardId: row.boardId,
        clientId,
        clientName: clientName ? escapeHtml(clientName) : null,
        taskId: row.taskId,
        matchedBy,
        route: routeFor(row, clientId),
      };
    }),
  );

  return NextResponse.json({ results, vectorEnabled });
}

/**
 * Builds the deep-link each result navigates to. Everything lives under a
 * client now — the standalone `/boards/:id` routes are gone — so a row with no
 * resolvable client can only offer the list it belongs to.
 */
function routeFor(row: typeof searchBlocks.$inferSelect, clientId: string | null): string {
  const task = row.taskId;

  switch (row.sourceType) {
    case "client":
      return clientId ? `/clients/${clientId}` : "/clients";

    // A task's brief still lives on the task, so it opens the task.
    case "task_block":
      return task && clientId
        ? `/clients/${clientId}/tasks/${task}`
        : clientId
          ? `/clients/${clientId}`
          : "/clients";

    case "doc_title":
      return row.docId && clientId ? `/clients/${clientId}/docs/${row.docId}` : "/docs";

    case "doc_block": {
      if (!row.docId || !clientId) return "/docs";
      const params = new URLSearchParams();
      if (row.blockId) params.set("blockId", row.blockId);
      if (row.blockIndex !== null) params.set("blockIndex", String(row.blockIndex));
      const suffix = params.toString() ? `?${params.toString()}` : "";
      return `/clients/${clientId}/docs/${row.docId}${suffix}`;
    }

    case "task_title":
    case "comment":
    case "asset":
      return task && clientId
        ? `/clients/${clientId}/tasks/${task}`
        : clientId
          ? `/clients/${clientId}`
          : "/clients";

    case "topic":
      return "/radar";
    case "community":
    case "broadcast":
      return "/communities";

    default:
      return clientId ? `/clients/${clientId}` : "/clients";
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  await requireUser();
  const body = (await req.json()) as {
    action: string;
    taskId?: string;
    clientId?: string;
  };

  if (body.action === "indexTask" && body.taskId) {
    void indexTask(body.taskId);
  } else if (body.action === "indexClient" && body.clientId) {
    void indexClient(body.clientId);
  } else {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
