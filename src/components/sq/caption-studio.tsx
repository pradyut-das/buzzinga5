"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AgentNote, EmptyState } from "@/components/sq/workspace";
import { attachCaption } from "@/actions/agency";

interface Draft {
  id: string;
  clientName: string;
  assetTitle: string;
  goal: string | null;
  voice: string | null;
  variants: { label: string; body: string; brandVoicePct: number }[];
  selectedIndex: number;
  finalBody: string | null;
  checks: Record<string, boolean> | null;
  attached: boolean;
}

const CHECK_LABELS: Record<string, string> = {
  brandVoice: "Brand voice",
  claimSafety: "Claim safety",
  platformLength: "Platform length",
  bannedPhrases: "No banned phrases",
};

/**
 * Three steps, left to right: the source context the agent reads, the
 * directions it drafted, and the copy you actually attach. Generation is
 * visible work — the inputs are named, not hidden behind a button.
 */
export function CaptionStudio({
  clients,
  sources,
  drafts,
}: {
  clients: { id: string; name: string }[];
  sources: {
    assetId: string;
    title: string;
    clientId: string;
    clientName: string;
    accent: string | null;
    kind: string;
  }[];
  drafts: Draft[];
}) {
  const router = useRouter();
  const [draftIndex, setDraftIndex] = useState(0);
  const [sourceId, setSourceId] = useState(sources[0]?.assetId ?? "");
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const draft = drafts[draftIndex] ?? null;
  const [selected, setSelected] = useState(draft?.selectedIndex ?? 0);
  const [copy, setCopy] = useState(draft?.finalBody ?? draft?.variants[0]?.body ?? "");
  const source = sources.find((item) => item.assetId === sourceId) ?? sources[0];

  const generate = async () => {
    if (!source) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Draft three Instagram caption variants for ${source.clientName}'s ${source.kind} "${source.title}". Return them as three short paragraphs separated by blank lines, no preamble.`,
          history: [],
        }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        error?: string;
      };
      if (payload.reply) setCopy(payload.reply.split(/\n{2,}/)[0] ?? payload.reply);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="sq-workspace-grid three">
      <section className="sq-panel sq-section">
        <div className="sq-stepper">
          <b>1 Asset</b>— 2 Direction — 3 Attach
        </div>
        <h2 style={{ margin: "10px 0" }}>Source asset</h2>

        {source ? (
          <>
            <div className="sq-asset-picker">
              <span className={`sq-asset-mini kind-${source.kind}`} />
              <div>
                <b>{source.title}</b>
                <div className="sq-sub">
                  {source.clientName} · {source.kind}
                </div>
              </div>
            </div>

            <div className="sq-field">
              <label htmlFor="studio-source">Switch asset</label>
              <select
                id="studio-source"
                className="sq-fieldbox"
                value={sourceId}
                onChange={(event) => setSourceId(event.target.value)}
              >
                {sources.map((item) => (
                  <option key={item.assetId} value={item.assetId}>
                    {item.clientName} · {item.title}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <EmptyState title="No asset selected" hint="Approvals feed this list." />
        )}

        <div className="sq-field">
          <label>Goal</label>
          <div className="sq-fieldbox">{draft?.goal ?? "Drive saves + thoughtful replies"}</div>
        </div>
        <div className="sq-field">
          <label>Voice</label>
          <div className="sq-fieldbox">{draft?.voice ?? "From the client brand kit"}</div>
        </div>

        <AgentNote>
          Squirrl reads the client brand kit, the task comments, the source asset and the hooks that
          performed before writing anything.
        </AgentNote>

        <button
          type="button"
          className="sq-pill amber"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => void generate()}
          disabled={generating || !source}
        >
          {generating ? "Generating…" : "Generate variants"}
        </button>
      </section>

      <section className="sq-panel sq-section">
        <div className="sq-eyebrow">
          {draft ? `${draft.variants.length} drafted variants` : "No run yet"}
        </div>
        <h2 style={{ margin: "5px 0 10px" }}>Pick a direction</h2>

        {draft ? (
          draft.variants.map((variant, index) => (
            <button
              key={variant.label}
              type="button"
              className={`sq-variant${selected === index ? " selected" : ""}`}
              onClick={() => {
                setSelected(index);
                setCopy(variant.body);
              }}
            >
              <span className="sq-tag">
                {variant.label} · {variant.brandVoicePct}%
              </span>
              <p>{variant.body}</p>
            </button>
          ))
        ) : (
          <EmptyState
            title="Nothing generated yet"
            hint="Pick an asset and press Generate variants."
          />
        )}

        {drafts.length > 1 && (
          <div className="sq-field">
            <label htmlFor="studio-run">Earlier runs</label>
            <select
              id="studio-run"
              className="sq-fieldbox"
              value={draftIndex}
              onChange={(event) => {
                const index = Number(event.target.value);
                setDraftIndex(index);
                setSelected(drafts[index].selectedIndex);
                setCopy(drafts[index].finalBody ?? drafts[index].variants[0]?.body ?? "");
              }}
            >
              {drafts.map((item, index) => (
                <option key={item.id} value={index}>
                  {item.clientName} · {item.assetTitle}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      <aside className="sq-panel sq-section">
        <div className="sq-eyebrow">Final edit</div>
        <h2 style={{ margin: "5px 0 10px" }}>Caption</h2>
        <textarea
          className="sq-fieldbox"
          style={{ minHeight: 240, lineHeight: 1.65 }}
          value={copy}
          onChange={(event) => setCopy(event.target.value)}
        />

        <div className="sq-field">
          <label>Squirrl checks</label>
          <div className="sq-sub">
            {Object.entries(draft?.checks ?? CHECK_LABELS).map(([key]) => (
              <div key={key}>✓ {CHECK_LABELS[key] ?? key}</div>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="sq-pill amber"
          style={{ width: "100%", height: 40 }}
          disabled={!draft || busy || !copy.trim()}
          onClick={() => {
            if (!draft) return;
            setBusy(true);
            startTransition(async () => {
              try {
                await attachCaption(draft.id, copy, selected);
                router.refresh();
              } finally {
                setBusy(false);
              }
            });
          }}
        >
          {busy ? "Attaching…" : draft?.attached ? "Attached ✓ — attach again" : "Attach to task"}
        </button>

        {!clients.length && <p className="sq-sub">No clients yet.</p>}
      </aside>
    </div>
  );
}
