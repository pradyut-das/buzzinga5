"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentNote, EmptyState, SectionHead } from "@/components/sq/workspace";
import { markPostPublished, reschedulePost } from "@/actions/agency";

interface Post {
  id: string;
  title: string;
  clientName: string;
  clientColor: string;
  platform: string;
  state: string;
  scheduledAt: string;
}

/**
 * Publishing is a user-confirmed step: nothing here goes out on its own, so
 * the queue shows what is ready, what is still in review, and lets the
 * founder push a date or mark something published.
 */
export function PublishingQueue({ posts }: { posts: Post[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const ready = posts.filter((post) => post.state === "scheduled" || post.state === "ready");
  const planned = posts.filter((post) => post.state === "planned");

  const act = (id: string, action: "publish" | "push") => {
    setBusy(id);
    startTransition(async () => {
      try {
        if (action === "publish") {
          await markPostPublished(id);
        } else {
          const post = posts.find((entry) => entry.id === id)!;
          const next = new Date(post.scheduledAt);
          next.setDate(next.getDate() + 1);
          await reschedulePost(id, next);
        }
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const row = (post: Post) => (
    <div
      key={post.id}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 12,
        alignItems: "center",
        padding: "12px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div>
        <b style={{ fontSize: 12 }}>{post.title}</b>
        <p className="sq-sub" style={{ margin: "3px 0 0" }}>
          <span
            className="sq-dot"
            style={{ background: post.clientColor, display: "inline-block" }}
          />{" "}
          {post.clientName} · {post.platform} ·{" "}
          {new Date(post.scheduledAt).toLocaleString("en-GB", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
      <div className="sq-tiny-actions" style={{ width: 200 }}>
        <button
          type="button"
          className="sq-tiny"
          disabled={busy === post.id}
          onClick={() => act(post.id, "push")}
        >
          Push a day
        </button>
        <button
          type="button"
          className="sq-tiny primary"
          disabled={busy === post.id}
          onClick={() => act(post.id, "publish")}
        >
          Mark published
        </button>
      </div>
    </div>
  );

  return (
    <div className="sq-workspace-grid two">
      <section className="sq-panel sq-section">
        <SectionHead eyebrow="Ready to go out" title={`${ready.length} scheduled`} />
        <AgentNote>
          Squirrl never publishes on its own. It can tell you what is blocked, reschedule around a
          collision, or follow up on a post that is still in review.
        </AgentNote>
        <div style={{ marginTop: 12 }}>
          {ready.map(row)}
          {!ready.length && (
            <EmptyState title="Nothing scheduled" hint="Approve work to fill this." />
          )}
        </div>
      </section>

      <aside className="sq-panel sq-section">
        <SectionHead eyebrow="Planned" title={`${planned.length} not yet ready`} />
        {planned.slice(0, 20).map((post) => (
          <div key={post.id} className="sq-queue-item">
            <b>{post.title}</b>
            <p>
              {post.clientName} ·{" "}
              {new Date(post.scheduledAt).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              })}
            </p>
          </div>
        ))}
        {!planned.length && <p className="sq-sub">Nothing waiting.</p>}
      </aside>
    </div>
  );
}
