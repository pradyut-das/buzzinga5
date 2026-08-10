"use client";

import { ArrowUpRight, BarChart3, Check, MessageSquareText, Sparkles } from "lucide-react";
import { SquirrlMascot, SquirrlMark } from "@/components/agent/squirrl-mark";
import type { LiveState } from "@/hooks/use-gemini-live";
import type { ApprovalRow, DashboardStats } from "@/lib/agent/stats";

interface SquirrlHomeProps {
  stats: DashboardStats;
  liveState: LiveState;
  agentEnabled: boolean;
  onOpenBoard: (boardId: string) => void;
  onOpenChat: () => void;
  onOpenStats: () => void;
  onOpenApprovals: () => void;
}

function ageLabel(days: number) {
  if (days === 0) return "Active today";
  return `${days}d quiet`;
}

function ApprovalCard({
  item,
  position,
  onOpen,
}: {
  item: ApprovalRow;
  position: number;
  onOpen: () => void;
}) {
  return (
    <article className={`squirrl-approval-card position-${position} featured`}>
      <button type="button" className="squirrl-approval-open" onClick={onOpen}>
        <span className={`squirrl-approval-art ${item.assetType}`} aria-hidden>
          {item.assetType === "video" ? <i>▶</i> : null}
          <strong>{item.title}</strong>
        </span>
        <span className="squirrl-approval-head">
          <strong>{item.boardTitle}</strong>
          <i>{ageLabel(item.ageDays)}</i>
        </span>
        <span className="squirrl-approval-meta">{item.assetType}</span>
      </button>
      <div className="squirrl-approval-actions">
        <button type="button" onClick={onOpen}>
          <MessageSquareText aria-hidden />
          Changes
        </button>
        <button type="button" className="primary" onClick={onOpen}>
          <Check aria-hidden />
          Approve
        </button>
      </div>
    </article>
  );
}

export function SquirrlHome({
  stats,
  liveState,
  agentEnabled,
  onOpenBoard,
  onOpenChat,
  onOpenStats,
  onOpenApprovals,
}: SquirrlHomeProps) {
  const approval = stats.approvals[0];
  const liveLabel = !agentEnabled
    ? "Voice unavailable"
    : liveState === "listening"
      ? "I’m listening"
      : liveState === "speaking"
        ? "Squirrl is speaking"
        : liveState === "thinking"
          ? "Checking your boards"
          : liveState === "connecting"
            ? "Opening voice"
            : liveState === "error"
              ? "Voice needs attention"
              : "Talk to Squirrl";

  return (
    <div className="squirrl-home-layer">
      <div className="squirrl-home-summary">
        <span>Today</span>
        <strong>
          {stats.totals.review
            ? `${stats.totals.review} ${stats.totals.review === 1 ? "item needs" : "items need"} your review`
            : "You’re all caught up"}
        </strong>
      </div>

      {approval ? (
        <ApprovalCard item={approval} position={1} onOpen={() => onOpenBoard(approval.boardId)} />
      ) : null}

      {stats.approvals.length > 1 ? (
        <button type="button" className="squirrl-queue-button" onClick={onOpenApprovals}>
          View {stats.approvals.length - 1} more in the review queue <ArrowUpRight aria-hidden />
        </button>
      ) : null}

      {!approval ? (
        <div className="squirrl-clear-state">
          <SquirrlMark />
          <strong>Your review queue is clear.</strong>
          <span>Ask Squirrl to plan the next batch or surface quiet work.</span>
        </div>
      ) : null}

      <SquirrlMascot className="scout" label="Your focus for today" />

      <div className="squirrl-voice-label" aria-live="polite">
        <strong>{liveLabel}</strong>
        <span>{liveState === "idle" ? "Click the orb or use text chat" : stats.topPriority}</span>
      </div>

      <section className="squirrl-capabilities" aria-label="What Squirrl can do">
        <p>
          <Sparkles aria-hidden /> Not sure where to start?
        </p>
        <div>
          <button type="button" onClick={onOpenChat}>
            Ask Squirrl what needs attention
          </button>
          <button type="button" className="capability-more" onClick={onOpenStats}>
            <BarChart3 aria-hidden /> Agency overview
          </button>
        </div>
      </section>
    </div>
  );
}
