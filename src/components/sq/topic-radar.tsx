"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentNote, EmptyState, SectionHead } from "@/components/sq/workspace";
import { SyncButton } from "@/components/sq/sync-button";
import { createBriefFromTopic, dismissTopic } from "@/actions/agency";

interface Topic {
  id: string;
  title: string;
  evidence: string | null;
  momentumPct: number;
  novelty: number;
  state: string;
  clientName: string;
  radarX: number;
  radarY: number;
}

/**
 * The map shows momentum spatially; the queue turns a signal into a brief on
 * the client's board. Every signal states why it matters, so nothing here is
 * an unexplained number.
 */
export function TopicRadar({ topics, syncStatus }: { topics: Topic[]; syncStatus: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(topics[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const act = (action: "brief" | "dismiss") => {
    if (!selected) return;
    setBusy(true);
    startTransition(async () => {
      try {
        if (action === "brief") await createBriefFromTopic(selected);
        else await dismissTopic(selected);
        router.refresh();
      } finally {
        setBusy(false);
      }
    });
  };

  return (
    <div className="sq-workspace-grid two">
      <section className="sq-panel sq-section">
        <SectionHead
          eyebrow="Instagram · last 48 hours"
          title="Topic radar"
          aside={<SyncButton provider="instagram" />}
        />
        <AgentNote>
          Squirrl can explain why a topic is moving, compare competitor angles, or create a brief
          and task from any signal you select.
        </AgentNote>

        {syncStatus === "not_configured" && (
          <p className="sq-sub" style={{ marginTop: 10 }}>
            Research provider not connected — set <code>INSTAGRAM_API_URL</code> to pull live
            signals.
          </p>
        )}

        {topics.length ? (
          <div className="sq-radar">
            {topics.slice(0, 8).map((topic) => (
              <button
                key={topic.id}
                type="button"
                className={`sq-topic${selected === topic.id ? " selected" : ""}`}
                style={{ left: `${topic.radarX}%`, top: `${topic.radarY}%` }}
                onClick={() => setSelected(topic.id)}
              >
                {topic.title}
                <br />
                <b>+{topic.momentumPct}%</b>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No fresh signals"
            hint="Sync the research provider to populate this."
          />
        )}
      </section>

      <aside className="sq-panel sq-section">
        <div className="sq-eyebrow">Unmade opportunities · {topics.length}</div>
        <h2 style={{ margin: "5px 0 12px" }}>Turn signals into content</h2>

        {topics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className={`sq-queue-item${selected === topic.id ? " selected" : ""}`}
            onClick={() => setSelected(topic.id)}
          >
            <b>{topic.title}</b>
            <p>
              {topic.clientName} · {topic.evidence ?? `momentum +${topic.momentumPct}%`}
            </p>
            <span className="sq-tag">{topic.state === "act_now" ? "Act now" : topic.state}</span>
          </button>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            type="button"
            className="sq-pill"
            disabled={!selected || busy}
            onClick={() => act("dismiss")}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="sq-pill amber"
            style={{ flex: 1 }}
            disabled={!selected || busy}
            onClick={() => act("brief")}
          >
            {busy ? "Creating…" : "Create brief from selected"}
          </button>
        </div>
      </aside>
    </div>
  );
}
