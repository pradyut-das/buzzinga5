"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { decideApproval } from "@/actions/agency";
import type { ApprovalCard } from "@/lib/agency/queries";

/**
 * One-handed triage row: the asset, who it is for, how old it is, and the two
 * decisions. Approving is spatially separated from asking for changes so the
 * destructive-to-momentum action is never the accidental one.
 */
export function ApprovalRow({ approval }: { approval: ApprovalCard }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approved" | "changes_requested" | null>(null);
  const [, startTransition] = useTransition();

  const decide = (decision: "approved" | "changes_requested") => {
    setBusy(decision);
    startTransition(async () => {
      try {
        await decideApproval(approval.id, decision);
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <article className="sq-approval-row">
      <Link href={`/approvals/${approval.id}`} className="sq-approval-row-art">
        <span className={`sq-asset-mini kind-${approval.kind}`} />
      </Link>

      <div className="sq-approval-row-copy">
        <Link href={`/approvals/${approval.id}`}>
          <b style={{ fontSize: 12 }}>{approval.title}</b>
        </Link>
        <p className="sq-sub" style={{ margin: "3px 0 0" }}>
          {approval.clientName} · {approval.kind} · {approval.ageLabel} old
        </p>
        {approval.reason && (
          <p className="sq-sub" style={{ margin: "3px 0 0", opacity: 0.8 }}>
            {approval.reason}
          </p>
        )}
      </div>

      <div className="sq-tiny-actions sq-approval-row-actions">
        <button
          type="button"
          className="sq-tiny"
          disabled={busy !== null}
          onClick={() => decide("changes_requested")}
        >
          {busy === "changes_requested" ? "Sending…" : "Changes"}
        </button>
        <button
          type="button"
          className="sq-tiny primary"
          disabled={busy !== null}
          onClick={() => decide("approved")}
        >
          {busy === "approved" ? "Approving…" : "Approve"}
        </button>
      </div>
    </article>
  );
}
