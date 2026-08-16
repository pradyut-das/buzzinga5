"use client";

import { useMemo, useState } from "react";
import { formatUsd } from "@/lib/ai/pricing";
import type { AiUsageByGroup, AiUsageEntry, AiUsageReport } from "@/lib/ai/report";

/**
 * The AI spend report.
 *
 * Built to answer two questions in order: "are we about to overspend?" and
 * "what exactly happened?". The budget bars come first because they are the
 * thing worth acting on; the call log is last because it is only needed once
 * something already looks wrong.
 */

type View = "overview" | "log" | "problems";

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function formatWhen(at: Date): string {
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** A cap and how close today's spend is to it. */
function BudgetBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
  const tone = ratio >= 1 ? "tone-red" : ratio >= 0.8 ? "tone-amber" : "tone-green";
  return (
    <div className="sq-metric" style={{ padding: 16 }}>
      <div className="sq-section-head" style={{ marginBottom: 8 }}>
        <strong className="sq-sub">{label}</strong>
        <span className={`sq-status-chip ${tone}`}>{Math.round(ratio * 100)}%</span>
      </div>
      <div
        aria-hidden
        style={{
          height: 6,
          borderRadius: 999,
          background: "var(--line)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: "100%",
            background:
              ratio >= 1
                ? "var(--red, #d64545)"
                : ratio >= 0.8
                  ? "var(--amber, #d99a2b)"
                  : "var(--green, #3f9d63)",
          }}
        />
      </div>
      <p className="sq-sub" style={{ marginTop: 8 }}>
        {formatUsd(used)} of {formatUsd(limit)} today
      </p>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: AiUsageByGroup[] }) {
  return (
    <section className="sq-panel">
      <div className="sq-section-head">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="sq-sub">Nothing recorded in this window.</p>
      ) : (
        <table className="sq-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Calls</th>
              <th>Errors</th>
              <th>Tokens</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.key}</td>
                <td>{row.calls}</td>
                <td>{row.errors > 0 ? <strong>{row.errors}</strong> : "—"}</td>
                <td>{formatTokens(row.totalTokens)}</td>
                <td>{formatUsd(row.costMicroUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function EntryTable({ entries, emptyLabel }: { entries: AiUsageEntry[]; emptyLabel: string }) {
  if (entries.length === 0) return <p className="sq-sub">{emptyLabel}</p>;
  return (
    <table className="sq-table">
      <thead>
        <tr>
          <th>When</th>
          <th>Who</th>
          <th>Surface</th>
          <th>Operation</th>
          <th>Model</th>
          <th>Status</th>
          <th>Tokens</th>
          <th>Cost</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td>{formatWhen(entry.createdAt)}</td>
            <td>{entry.userEmail ?? "system"}</td>
            <td>{entry.surface}</td>
            <td>{entry.operation}</td>
            <td>{entry.model}</td>
            <td>
              <span
                className={`sq-status-chip ${
                  entry.status === "ok"
                    ? "tone-green"
                    : entry.status === "blocked"
                      ? "tone-amber"
                      : "tone-red"
                }`}
              >
                {entry.status}
              </span>
              {/* The reason a call cost nothing matters as much as the cost. */}
              {(entry.errorMessage || entry.blockedBy) && (
                <span className="sq-sub" style={{ display: "block" }}>
                  {entry.blockedBy ?? entry.errorMessage}
                </span>
              )}
            </td>
            <td>{formatTokens(entry.totalTokens)}</td>
            <td>
              {formatUsd(entry.costMicroUsd)}
              {entry.estimated && (
                <span
                  className="sq-sub"
                  title="Estimated from session duration, not measured tokens"
                >
                  {" "}
                  est.
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AiUsagePanel({ report }: { report: AiUsageReport }) {
  const [view, setView] = useState<View>("overview");

  const peakDay = useMemo(
    () => report.byDay.reduce((max, day) => Math.max(max, day.costMicroUsd), 0),
    [report.byDay],
  );

  return (
    <div className="sq-admin">
      <nav className="sq-admin-tabs">
        {(["overview", "log", "problems"] as View[]).map((name) => (
          <button
            key={name}
            type="button"
            className={`sq-pill${view === name ? " amber" : ""}`}
            onClick={() => setView(name)}
          >
            {name[0].toUpperCase() + name.slice(1)}
            {name === "problems" && report.problems.length > 0
              ? ` (${report.problems.length})`
              : ""}
          </button>
        ))}
        <span className="sq-sub">Last {report.days} days</span>
      </nav>

      {view === "overview" && (
        <>
          <section className="sq-panel">
            <div className="sq-section-head">
              <h2>Today against the caps</h2>
              <span className="sq-sub">Resets at midnight UTC</span>
            </div>
            <div
              className="sq-metrics"
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <BudgetBar
                label="Agency spend"
                used={report.today.costMicroUsd}
                limit={report.limits.globalCostMicroUsdPerDay}
              />
              <div className="sq-metric" style={{ padding: 16 }}>
                <strong className="sq-sub">Calls today</strong>
                <p style={{ fontSize: 28, fontWeight: 650, margin: "6px 0 0" }}>
                  {report.today.calls}
                </p>
                <p className="sq-sub">of {report.limits.globalCallsPerDay} allowed</p>
              </div>
              <div className="sq-metric" style={{ padding: 16 }}>
                <strong className="sq-sub">Per-user daily cap</strong>
                <p style={{ fontSize: 28, fontWeight: 650, margin: "6px 0 0" }}>
                  {formatUsd(report.limits.userCostMicroUsdPerDay)}
                </p>
                <p className="sq-sub">
                  {report.limits.userCallsPerMinute}/min · {report.limits.userCallsPerDay}/day ·
                  admins exempt
                </p>
              </div>
            </div>
          </section>

          <section className="sq-panel">
            <div className="sq-section-head">
              <h2>Window totals</h2>
              <span className="sq-sub">since {new Date(report.since).toLocaleDateString()}</span>
            </div>
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              }}
            >
              <div className="sq-metric" style={{ padding: 16 }}>
                <strong className="sq-sub">Total cost</strong>
                <p style={{ fontSize: 26, fontWeight: 650, margin: "6px 0 0" }}>
                  {formatUsd(report.totals.costMicroUsd)}
                </p>
                {report.totals.estimatedCostMicroUsd > 0 && (
                  <p className="sq-sub">
                    {formatUsd(report.totals.estimatedCostMicroUsd)} of it estimated (voice)
                  </p>
                )}
              </div>
              <div className="sq-metric" style={{ padding: 16 }}>
                <strong className="sq-sub">Tokens</strong>
                <p style={{ fontSize: 26, fontWeight: 650, margin: "6px 0 0" }}>
                  {formatTokens(report.totals.totalTokens)}
                </p>
              </div>
              <div className="sq-metric" style={{ padding: 16 }}>
                <strong className="sq-sub">Calls</strong>
                <p style={{ fontSize: 26, fontWeight: 650, margin: "6px 0 0" }}>
                  {report.totals.calls}
                </p>
              </div>
              <div className="sq-metric" style={{ padding: 16 }}>
                <strong className="sq-sub">Errors / blocked</strong>
                <p style={{ fontSize: 26, fontWeight: 650, margin: "6px 0 0" }}>
                  {report.totals.errors} / {report.totals.blocked}
                </p>
              </div>
            </div>
          </section>

          <section className="sq-panel">
            <div className="sq-section-head">
              <h2>Daily spend</h2>
            </div>
            {report.byDay.length === 0 ? (
              <p className="sq-sub">Nothing recorded yet.</p>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
                {report.byDay.map((day) => (
                  <div
                    key={day.day}
                    title={`${day.day}: ${formatUsd(day.costMicroUsd)} · ${day.calls} calls`}
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        // Bars are relative to the window's own peak: an absolute
                        // scale would flatten every normal day against one spike.
                        height: `${peakDay > 0 ? Math.max(2, (day.costMicroUsd / peakDay) * 100) : 2}%`,
                        background: "var(--amber, #d99a2b)",
                        borderRadius: "4px 4px 0 0",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <GroupTable title="By surface" rows={report.bySurface} />
          <GroupTable title="By user" rows={report.byUser} />
          <GroupTable title="By model" rows={report.byModel} />
        </>
      )}

      {view === "log" && (
        <section className="sq-panel">
          <div className="sq-section-head">
            <h2>Recent calls</h2>
            <span className="sq-sub">Newest 100</span>
          </div>
          <EntryTable entries={report.recent} emptyLabel="No calls recorded yet." />
        </section>
      )}

      {view === "problems" && (
        <section className="sq-panel">
          <div className="sq-section-head">
            <h2>Errors and refusals</h2>
            <span className="sq-sub">Newest 50</span>
          </div>
          <EntryTable
            entries={report.problems}
            emptyLabel="No errors and nothing refused in this window."
          />
        </section>
      )}
    </div>
  );
}
