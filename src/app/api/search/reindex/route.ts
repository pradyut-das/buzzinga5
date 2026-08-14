import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { reindexAll } from "@/lib/search/indexer";

export const dynamic = "force-dynamic";

/**
 * Auth-gated full reindex, exposed so the index can be rebuilt from the admin
 * console instead of SSHing into the box. Slow on first run (embeds every
 * block); later runs only re-embed changed rows.
 */
export async function POST(): Promise<NextResponse> {
  await requireAdmin();
  const started = Date.now();
  const summary = await reindexAll();
  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - started,
    ...summary,
  });
}
