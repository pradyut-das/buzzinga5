"use client";

import type { DashboardStats } from "@/lib/agent/stats";

/**
 * The executive pulse from the Squirrl dashboard: a health ring plus the five
 * numbers a creator decides on, above everything else on the plate.
 */
function tone(value: number, warnAt = 1, badAt = 4) {
  return value >= badAt ? "bad" : value >= warnAt ? "warn" : "";
}

export function DeskGlance({ stats }: { stats: DashboardStats }) {
  const { totals, health } = stats;

  const healthTone = health.score >= 70 ? "" : health.score >= 50 ? "warn" : "bad";
  const healthColour =
    health.score >= 70
      ? "var(--desk-good)"
      : health.score >= 50
        ? "var(--desk-warn)"
        : "var(--desk-bad)";
  const signalTone = totals.blocked ? "late" : totals.unassigned || totals.stale ? "risk" : "";

  const done = totals.tasks ? Math.round((totals.done / totals.tasks) * 100) : 0;
  const owned = totals.open
    ? Math.round(((totals.open - totals.unassigned) / totals.open) * 100)
    : 100;

  return (
    <section className="desk-glance" aria-label="Executive pulse">
      <div className="desk-glance-head">
        <span>Executive pulse</span>
        <p className={`desk-glance-signal ${signalTone}`}>
          <i />
          <span>{stats.topPriority}</span>
        </p>
      </div>

      <div className="desk-metrics">
        <div className={`desk-metric ${healthTone}`} title={health.drivers.join(" · ")}>
          <span
            className="desk-ring"
            style={{ "--score": health.score, "--desk-tone": healthColour } as React.CSSProperties}
          >
            <b>{health.score}</b>
          </span>
          <span className="desk-metric-copy">
            <small>Delivery health</small>
            <em>{health.label}</em>
          </span>
        </div>

        <div className="desk-metric">
          <span className="desk-metric-value">{totals.open}</span>
          <span className="desk-metric-copy">
            <small>Open work</small>
            <em>
              {totals.done} done · {totals.tasks} total
            </em>
          </span>
          <i className="desk-progress">
            <b style={{ width: `${done}%` }} />
          </i>
        </div>

        <div className={`desk-metric ${tone(totals.unassigned)}`}>
          <span className="desk-metric-value">{totals.unassigned}</span>
          <span className="desk-metric-copy">
            <small>Unassigned</small>
            <em>{totals.unassigned ? "No owner yet" : "Everything owned"}</em>
          </span>
          <i className="desk-progress">
            <b style={{ width: `${owned}%` }} />
          </i>
        </div>

        <div className={`desk-metric ${tone(totals.review)}`}>
          <span className="desk-metric-value">{totals.review}</span>
          <span className="desk-metric-copy">
            <small>Awaiting review</small>
            <em>{totals.review ? "Needs a decision" : "Queue clear"}</em>
          </span>
        </div>

        <div className={`desk-metric ${tone(totals.blocked)}`}>
          <span className="desk-metric-value">{totals.blocked}</span>
          <span className="desk-metric-copy">
            <small>Blocked</small>
            <em>{totals.blocked ? "Stuck right now" : "Nothing stuck"}</em>
          </span>
        </div>
      </div>
    </section>
  );
}
