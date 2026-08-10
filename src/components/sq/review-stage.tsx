"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReviewNote, decideApproval } from "@/actions/agency";
import type { ApprovalState, AssetKind } from "@/db/schema";

/**
 * The asset dominates; the decision sits under it. Carousels page by slide and
 * notes pin to the slide you are looking at, so "fix slide 5" lands on slide 5.
 */
export function ReviewStage({
  approvalId,
  state,
  title,
  clientName,
  kind,
  blobUrl,
  slideCount,
  durationSeconds,
  body,
}: {
  approvalId: string;
  state: ApprovalState;
  title: string;
  clientName: string;
  kind: AssetKind;
  accent: string | null;
  blobUrl: string | null;
  slideCount: number | null;
  durationSeconds: number | null;
  body: string | null;
}) {
  const router = useRouter();
  const [slide, setSlide] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const slides = slideCount ?? 1;

  const decide = (decision: "approved" | "changes_requested") => {
    setBusy(decision);
    startTransition(async () => {
      try {
        if (decision === "changes_requested" && note.trim()) {
          await addReviewNote(approvalId, note.trim(), kind === "carousel" ? slide : undefined);
        }
        await decideApproval(approvalId, decision, note.trim() || undefined);
        setNote("");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const pinNote = () => {
    if (!note.trim()) return;
    setBusy("note");
    startTransition(async () => {
      try {
        await addReviewNote(approvalId, note.trim(), kind === "carousel" ? slide : undefined);
        setNote("");
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <section className="sq-panel sq-section sq-review-stage">
      <div className="sq-review-media">
        {blobUrl && kind === "video" ? (
          <video src={blobUrl} controls style={{ maxWidth: "100%", maxHeight: "100%" }} />
        ) : blobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blobUrl} alt={title} style={{ maxWidth: "100%", maxHeight: "100%" }} />
        ) : (
          <div className={`sq-carousel-art kind-${kind}`}>
            <small>
              {clientName.toUpperCase()} ·{" "}
              {kind === "carousel"
                ? `${String(slide).padStart(2, "0")} / ${String(slides).padStart(2, "0")}`
                : kind === "video"
                  ? `VIDEO · ${durationSeconds ?? 0}s`
                  : kind.toUpperCase()}
            </small>
            <b>{body ?? title}</b>
          </div>
        )}
      </div>

      <div className="sq-review-controls">
        <button
          type="button"
          onClick={() => setSlide((current) => Math.max(1, current - 1))}
          disabled={kind !== "carousel" || slide === 1}
        >
          ‹ prev
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => decide("changes_requested")}
            disabled={busy !== null || state !== "pending"}
          >
            {busy === "changes_requested" ? "Sending…" : "Request changes"}
          </button>
          <button
            type="button"
            className="approve"
            onClick={() => decide("approved")}
            disabled={busy !== null || state !== "pending"}
          >
            {state === "approved"
              ? "Approved"
              : busy === "approved"
                ? "Approving…"
                : "Approve asset"}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setSlide((current) => Math.min(slides, current + 1))}
          disabled={kind !== "carousel" || slide >= slides}
        >
          next ›
        </button>
      </div>

      <div className="sq-field" style={{ margin: 0 }}>
        <label htmlFor="review-note">
          {kind === "carousel" ? `Pin a comment to slide ${slide}` : "Request a precise change"}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="review-note"
            className="sq-fieldbox"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What needs to change?"
          />
          <button type="button" className="sq-pill" onClick={pinNote} disabled={!note.trim()}>
            {busy === "note" ? "Pinning…" : "Pin"}
          </button>
        </div>
      </div>
    </section>
  );
}
