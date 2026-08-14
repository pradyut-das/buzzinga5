import { FileText, Layers } from "lucide-react";
import Link from "next/link";
import type { DocSummary } from "@/lib/agency/queries";

/**
 * Doc cards. `hrefFor` differs by where the list is shown: the client view
 * keeps you inside that client, the all-clients view walks you into one.
 */
export function DocsList({
  docs,
  hrefFor,
}: {
  docs: DocSummary[];
  hrefFor: (doc: DocSummary) => string;
}) {
  if (!docs.length) {
    return (
      <div className="rounded-[18px] border border-line bg-white p-12 text-center shadow-soft">
        <h2 className="text-lg font-semibold">No docs yet</h2>
        <p className="mt-2 text-sm text-muted">Write a brief in any task and it shows up here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {docs.map((doc) => (
        <Link
          key={doc.id}
          href={hrefFor(doc)}
          className="group rounded-[18px] border border-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-[#f2e3b3]"
        >
          <div className="flex items-start justify-between">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#2b6ff5]/10 text-[#2b6ff5]">
              <FileText className="h-5 w-5" aria-hidden />
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-muted">
              <Layers className="h-3.5 w-3.5" aria-hidden />
              {doc.blockCount} block{doc.blockCount === 1 ? "" : "s"}
            </span>
          </div>
          <h3 className="mt-6 line-clamp-2 text-lg font-semibold leading-snug tracking-[-0.02em] group-hover:text-accent-foreground">
            {doc.title}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted">
            {doc.snippet || "No text in the first block."}
          </p>
        </Link>
      ))}
    </div>
  );
}
