/**
 * Backfills the block-search index from the source tables.
 *
 * Run after deploying the search migration, or any time the index looks stale:
 *
 *   pnpm search:reindex
 *
 * The first run embeds every block (slow on large databases). Later runs only
 * re-embed rows whose content changed.
 */
import { reindexAll } from "@/lib/search/indexer";

async function main() {
  console.log("Rebuilding block-search index…");
  const started = Date.now();
  const summary = await reindexAll();
  console.log(
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s — ` +
      `${summary.sources} sources indexed, ${summary.failed} failed.`,
  );
  process.exit(summary.failed > 0 ? 1 : 0);
}

void main();
