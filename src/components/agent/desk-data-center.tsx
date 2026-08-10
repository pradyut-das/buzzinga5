"use client";

import { useState } from "react";
import type { DashboardStats } from "@/lib/agent/stats";

type TabId = "boards" | "pipeline" | "people" | "risks" | "activity";

const TABS: { id: TabId; label: string }[] = [
  { id: "boards", label: "Boards" },
  { id: "pipeline", label: "Pipeline" },
  { id: "people", label: "Team" },
  { id: "risks", label: "Risks" },
  { id: "activity", label: "Activity" },
];

/** The reference's data center: the whole planner, one tab at a time. */
export function DeskDataCenter({
  stats,
  mobileOpen,
  recent,
  onOpenBoard,
}: {
  stats: DashboardStats;
  mobileOpen: boolean;
  /** The locally remembered boards list, shared with the signed-out homepage. */
  recent: React.ReactNode;
  /** Boards open in a dialog over the desk instead of navigating away. */
  onOpenBoard: (boardId: string) => void;
}) {
  const [tab, setTab] = useState<TabId>("boards");

  return (
    <section
      className={`desk-panel desk-data${mobileOpen ? " mobile-open" : ""}`}
      aria-label="Data center"
    >
      <div className="desk-panel-title">
        <span>Data center</span>
        <span className="desk-clock">{stats.totals.tasks} rows</span>
      </div>

      <div className="desk-tabs">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className="desk-tab"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="desk-tab-body">
        {tab === "boards" && (
          <>
            <Boards stats={stats} open={onOpenBoard} />
            <div className="desk-recent">{recent}</div>
          </>
        )}
        {tab === "pipeline" && <Pipeline stats={stats} />}
        {tab === "people" && <People stats={stats} />}
        {tab === "risks" && <Risks stats={stats} open={onOpenBoard} />}
        {tab === "activity" && <Activity stats={stats} />}
      </div>
    </section>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="desk-empty">{children}</p>;
}

function Boards({ stats, open }: { stats: DashboardStats; open: (id: string) => void }) {
  if (!stats.boards.length) return <Empty>No boards yet — say “create a board”</Empty>;

  return (
    <>
      {stats.boards.map((board) => (
        <button
          key={board.id}
          type="button"
          className={`desk-item${board.blocked ? " blocked" : board.open ? " active" : " done"}`}
          onClick={() => open(board.id)}
        >
          <div className="desk-item-text">{board.title}</div>
          <div className="desk-item-meta">
            <span>
              {board.open} open · {board.unassigned} unowned · {board.stale} quiet
            </span>
            <span>{board.completion}%</span>
          </div>
          <div className="desk-mini-bar">
            <i className="met" style={{ width: `${board.completion}%` }} />
          </div>
        </button>
      ))}
    </>
  );
}

function Pipeline({ stats }: { stats: DashboardStats }) {
  if (!stats.pipeline.length) return <Empty>No columns yet</Empty>;
  const peak = Math.max(...stats.pipeline.map((entry) => entry.count));

  return (
    <>
      <div className="desk-group-label">── columns ──</div>
      {stats.pipeline.map((entry) => (
        <div key={entry.name} className="desk-item">
          <div className="desk-item-meta">
            <span>{entry.name}</span>
            <span>{entry.count}</span>
          </div>
          <div className="desk-mini-bar">
            <i
              className={entry.kind === "blocked" ? "short" : entry.kind === "done" ? "met" : ""}
              style={{ width: `${peak ? (entry.count / peak) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}

      <div className="desk-group-label">── priority mix ──</div>
      <div className="desk-chip-row">
        {stats.priorityMix.map(({ priority, count }) => (
          <span
            key={priority}
            className={`desk-chip${priority === "urgent" || priority === "high" ? " accent" : ""}`}
          >
            {priority} {count}
          </span>
        ))}
      </div>
    </>
  );
}

function People({ stats }: { stats: DashboardStats }) {
  if (!stats.workload.length) return <Empty>Nobody has open work assigned</Empty>;
  const peak = Math.max(...stats.workload.map((person) => person.open));

  return (
    <>
      {stats.workload.map((person) => (
        <div
          key={`${person.boardTitle}-${person.name}`}
          className={`desk-item${person.open >= 5 ? " late" : " active"}`}
        >
          <div className="desk-item-text">{person.name}</div>
          <div className="desk-item-meta">
            <span>{person.boardTitle}</span>
            <span>
              {person.open} open{person.urgent ? ` · ${person.urgent} urgent` : ""}
            </span>
          </div>
          <div className="desk-mini-bar">
            <i
              className={person.open >= 5 ? "short" : ""}
              style={{ width: `${peak ? (person.open / peak) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
      {stats.totals.unassigned > 0 && (
        <div className="desk-group-label">
          {stats.totals.unassigned} open tasks still have no owner
        </div>
      )}
    </>
  );
}

function Risks({ stats, open }: { stats: DashboardStats; open: (id: string) => void }) {
  if (!stats.risks.length) return <Empty>Nothing flagged — everything is owned and moving</Empty>;

  return (
    <>
      {stats.risks.map((risk) => (
        <button
          key={risk.taskId}
          type="button"
          className="desk-item late"
          onClick={() => open(risk.boardId)}
        >
          <div className="desk-item-text">{risk.title}</div>
          <div className="desk-item-meta">
            <span>
              {risk.reason} · {risk.columnName}
            </span>
            <span>{risk.ageDays}d</span>
          </div>
        </button>
      ))}
    </>
  );
}

function Activity({ stats }: { stats: DashboardStats }) {
  if (!stats.activity.length) return <Empty>No comments yet</Empty>;

  return (
    <>
      {stats.activity.map((entry) => (
        <div key={entry.id} className="desk-item">
          <div className="desk-item-text">
            {entry.author} · {entry.taskTitle}
          </div>
          <div className="desk-item-meta">
            <span>{entry.preview || "(no text)"}</span>
            <span>{new Date(entry.createdAt).toLocaleDateString("en-GB")}</span>
          </div>
        </div>
      ))}
    </>
  );
}
