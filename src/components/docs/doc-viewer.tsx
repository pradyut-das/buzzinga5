"use client";

import { SquareCheckBig } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DocEditor } from "@/components/docs/doc-editor";
import { BlockHighlight } from "@/components/search/block-highlight";
import type { DocViewer as DocViewerData } from "@/lib/agency/queries";
import { TASK_STATUS_LABELS, TASK_STATUS_TONE } from "@/lib/task-types";

/**
 * The desk's status tones as Tailwind. The task workspace draws the same chip
 * from `desk-v2.css`, which that route imports and this one does not.
 */
const TONE_CLASS = {
  neutral: "bg-slate-50 text-slate-600 ring-slate-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
} as const;

/**
 * One doc as a page you write in. A doc belongs to a client, not to a board —
 * the linked task, when there is one, is shown as a reference rather than as
 * the thing being edited.
 */
export function DocViewer({ doc }: { doc: DocViewerData }) {
  const taskHref = doc.client && doc.task ? `/clients/${doc.client.id}/tasks/${doc.task.id}` : null;

  return (
    <div className="mx-auto max-w-[860px]">
      <Suspense fallback={null}>
        <BlockHighlight taskId={doc.doc.id} />
      </Suspense>

      <div className="flex items-center gap-2 pb-6 pt-2 text-sm">
        {doc.client ? (
          <>
            <Link
              href={`/clients/${doc.client.id}`}
              className="font-medium text-muted transition-colors hover:text-ink"
            >
              {doc.client.name}
            </Link>
            <span className="text-slate-300">/</span>
          </>
        ) : null}
        <Link href="/docs" className="font-medium text-muted transition-colors hover:text-ink">
          Docs
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <h1 className="min-w-0 text-[34px] font-semibold leading-tight tracking-[-0.035em] text-ink sm:text-[40px]">
          {doc.doc.title}
        </h1>
        {taskHref && doc.task && (
          <Link
            href={taskHref}
            className="flex shrink-0 items-center gap-2 rounded-[13px] border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink shadow-soft transition hover:bg-slate-50"
          >
            <SquareCheckBig className="h-4 w-4 text-muted" aria-hidden />
            <span className="max-w-[220px] truncate">{doc.task.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                TONE_CLASS[TASK_STATUS_TONE[doc.task.status]]
              }`}
            >
              {TASK_STATUS_LABELS[doc.task.status]}
            </span>
          </Link>
        )}
      </div>

      <DocEditor docId={doc.doc.id} content={doc.doc.content} />
    </div>
  );
}
