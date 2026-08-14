# Feature: Docs search (⌘K)

## Overview

A global command palette that searches every piece of content in the
workspace: task titles, blocks of task docs, comments, assets, topics,
communities, broadcasts, and clients. Results deep-link to the exact thing
matched — a task opens with its sidebar, a doc block opens with that block
highlighted.

## User Flows

### Open the palette

- Press `Cmd+K` / `Ctrl+K` anywhere to toggle the palette; `Esc` closes it.
- The search button in the Agency OS header opens the same palette.
- Works on board pages (`/boards/{boardId}`) and in the Agency OS
  (`/`, `/clients/{clientId}`, `/radar`, `/communities`, …).

### Search

- Start typing — results appear after a short debounce (min. 2 characters).
- Results are grouped by kind: `Tasks`, `Comments`, `Assets`, `Topics`,
  `Communities`, `Broadcasts`, `Clients`.
- The query is matched two ways at once and the orderings merged:
  - keyword — substring match on the block text and its title
  - semantic — Gemini `gemini-embedding-001` cosine similarity
- Snippets highlight matching terms; results that matched both arms rank
  higher (reciprocal-rank fusion).
- Semantic search is skipped (keyword-only) when the Gemini API key is
  missing or the database has no vector support.
- If no row matches a term literally, the palette shows nothing — semantic
  hits are only surfaced alongside a keyword match, so gibberish queries do
  not return random nearest neighbors.

### Open a result

- `Enter` (or click) on a result navigates to its deep link:
  - Task title → `/boards/{boardId}?task={taskId}` opens the task sidebar
  - Task doc block → `/docs/{taskId}?blockId=…&blockIndex=…` opens the single
    doc viewer, where the target block scrolls into view and flashes briefly
  - Comment → `?task={taskId}&comment={commentId}` with the task sidebar
  - Asset / topic / community / broadcast → the client board with the
    matching `?asset=` / `?topic=` / `?community=` / `?broadcast=`
  - Client → `/clients/{clientId}`

## Notes

- The index lives in `search_blocks` (one row per searchable unit) with an
  optional `search_embeddings` side table created lazily only when the host
  supports libSQL vectors.
- Rows carry deterministic ids (`sourceType:sourceId:suffix`) and a content
  hash, so re-indexing is a clean delete+insert that only re-embeds changed
  rows.
- Mutations re-index their source in the background: task title/doc, comments,
  asset titles, clients, communities/topics from provider syncs.
- `pnpm search:reindex` rebuilds everything; admins can also hit
  `POST /api/search/reindex`.
- Doc blocks use the block's position (`blockIndex`) for deep links today; a
  stable per-block id (`blockId`) is supported end-to-end and will be stamped
  by the editor later.
