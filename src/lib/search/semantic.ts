import { and, eq, inArray, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { searchBlocks } from "@/db/schema";
import { buildSnippet, rrfFuse } from "@/lib/search/text";
import { embedText, ensureSearchVector, searchSemantic } from "@/lib/search/vector";

/**
 * The shared retrieval core behind both the ⌘K palette and the agent's
 * `semantic_search` tool.
 *
 * Two arms run over the same `search_blocks` rows: substring keyword matching,
 * and vector nearest-neighbour. Unlike the palette's original behaviour, the
 * semantic arm retrieves on its own rather than only reranking keyword hits —
 * "work that slipped" has to find an overdue task that never uses those words.
 *
 * Recall is deliberately preferred over precision here. Measured on this
 * corpus, absolute cosine distance does not separate a relevant hit from an
 * irrelevant one: gibberish lands at 0.33 while a genuinely related phrase
 * lands at 0.37, and the orderings overlap. So no threshold is applied and no
 * hit is presented as certain — every row carries `matchedBy`, and the caller
 * (the model, or the palette's own ranking) decides what is worth showing.
 */

export type SearchSourceType = typeof searchBlocks.$inferSelect.sourceType;

/**
 * Docs and tasks are different things and are searched separately. A question
 * about work must not answer with prose, and a question about writing must not
 * answer with a card, so callers pick one of these rather than searching all
 * block kinds by default.
 */
export const TASK_SOURCE_TYPES = [
  "task_title",
  "task_block",
] as const satisfies readonly SearchSourceType[];
export const DOC_SOURCE_TYPES = [
  "doc_title",
  "doc_block",
] as const satisfies readonly SearchSourceType[];

export interface SemanticSearchOptions {
  query: string;
  /** Board ids the caller may see. Empty means unrestricted (UI palette). */
  boardIds?: string[];
  /** Narrow to one client's work. */
  clientId?: string | null;
  /** Narrow to one board. */
  boardId?: string | null;
  /** Narrow to one doc. */
  docId?: string | null;
  /** Restrict to these block kinds, e.g. tasks only. */
  sourceTypes?: SearchSourceType[];
  limit?: number;
  /** Set false to skip embeddings entirely (keyword only). */
  semantic?: boolean;
}

export interface SemanticSearchRow {
  row: typeof searchBlocks.$inferSelect;
  score: number;
  /** Which arm surfaced the row, for explaining results. */
  matchedBy: "keyword" | "semantic" | "both";
}

export interface SemanticSearchResult {
  rows: SemanticSearchRow[];
  vectorEnabled: boolean;
}

const CANDIDATES = 60;

function scopeFilter(options: SemanticSearchOptions): SQL | undefined {
  const clauses: (SQL | undefined)[] = [];
  if (options.boardIds?.length) clauses.push(inArray(searchBlocks.boardId, options.boardIds));
  if (options.clientId) clauses.push(eq(searchBlocks.clientId, options.clientId));
  if (options.boardId) clauses.push(eq(searchBlocks.boardId, options.boardId));
  if (options.docId) clauses.push(eq(searchBlocks.docId, options.docId));
  if (options.sourceTypes?.length) {
    clauses.push(inArray(searchBlocks.sourceType, options.sourceTypes));
  }
  const present = clauses.filter((clause): clause is SQL => clause !== undefined);
  return present.length ? and(...present) : undefined;
}

/** Rewards rows with the query terms appearing more often and in the title. */
function scoreKeyword(row: typeof searchBlocks.$inferSelect, terms: string[]): number {
  const title = row.sourceTitle.toLowerCase();
  const target = `${title} ${row.content.toLowerCase()}`;
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    let index = -1;
    let count = 0;
    while ((index = target.indexOf(term, index + 1)) !== -1) count += 1;
    score += count > 0 ? count + (title.includes(term) ? 2 : 0) : 0;
  }
  return score;
}

async function keywordArm(
  terms: string[],
  options: SemanticSearchOptions,
  limit: number,
): Promise<SemanticSearchRow[]> {
  if (!terms.length) return [];
  const scope = scopeFilter(options);
  const matches = or(
    ...terms.map((term) =>
      or(like(searchBlocks.content, `%${term}%`), like(searchBlocks.sourceTitle, `%${term}%`)),
    ),
  );

  const rows = await db
    .select()
    .from(searchBlocks)
    .where(scope ? and(scope, matches) : matches)
    .limit(200);

  return rows
    .map((row) => ({ row, score: scoreKeyword(row, terms), matchedBy: "keyword" as const }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function semanticArm(
  query: string,
  options: SemanticSearchOptions,
  limit: number,
): Promise<SemanticSearchRow[]> {
  const vector = await embedText(query);
  if (!vector) return [];

  // Over-fetch: neighbours are ranked globally, so scoping thins the list
  // afterwards and a scoped search still has candidates left.
  const hits = await searchSemantic(vector, CANDIDATES);
  if (!hits.length) return [];

  const scope = scopeFilter(options);
  const ids = inArray(
    searchBlocks.id,
    hits.map((hit) => hit.id),
  );
  const rows = await db
    .select()
    .from(searchBlocks)
    .where(scope ? and(scope, ids) : ids);

  const byId = new Map(rows.map((row) => [row.id, row]));
  const found: SemanticSearchRow[] = [];
  for (const hit of hits) {
    const row = byId.get(hit.id);
    if (!row) continue;
    found.push({ row, score: Math.max(0, 1 - hit.distance), matchedBy: "semantic" });
    if (found.length === limit) break;
  }
  return found;
}

export async function semanticSearch(
  options: SemanticSearchOptions,
): Promise<SemanticSearchResult> {
  const query = options.query.trim();
  const limit = Math.min(Math.max(options.limit ?? 14, 1), 50);
  if (!query) return { rows: [], vectorEnabled: false };

  // A caller with an empty board list can see nothing, which is not the same
  // as an unscoped caller. Only an absent list means unrestricted.
  if (options.boardIds && options.boardIds.length === 0) {
    return { rows: [], vectorEnabled: false };
  }

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const wantsVector = options.semantic !== false && (await ensureSearchVector());

  const [keyword, semantic] = await Promise.all([
    keywordArm(terms, options, limit),
    wantsVector ? semanticArm(query, options, limit) : Promise.resolve([]),
  ]);

  if (!semantic.length) return { rows: keyword.slice(0, limit), vectorEnabled: wantsVector };
  if (!keyword.length) return { rows: semantic.slice(0, limit), vectorEnabled: wantsVector };

  const keywordIds = new Set(keyword.map((item) => item.row.id));
  const semanticIds = new Set(semantic.map((item) => item.row.id));
  const fused = rrfFuse<SemanticSearchRow>(keyword, semantic, (item) => item.row.id)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      matchedBy:
        keywordIds.has(item.row.id) && semanticIds.has(item.row.id)
          ? ("both" as const)
          : item.matchedBy,
    }));

  return { rows: fused, vectorEnabled: wantsVector };
}

/** Flat, model-friendly shape: no ids the model has no use for. */
export function toAgentHits(rows: SemanticSearchRow[], terms: string[]) {
  return rows.map(({ row, score, matchedBy }) => ({
    kind: row.sourceType,
    title: row.sourceTitle,
    snippet: buildSnippet(row.content, terms).replace(/<\/?mark>/g, ""),
    taskId: row.taskId,
    docId: row.docId,
    clientId: row.clientId,
    boardId: row.boardId,
    matchedBy,
    score: Number(score.toFixed(3)),
  }));
}
