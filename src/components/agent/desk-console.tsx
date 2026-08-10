"use client";

import { useEffect } from "react";
import { DeskAnalyzer } from "@/components/agent/desk-analyzer";
import { DeskDataCenter } from "@/components/agent/desk-data-center";
import { DeskGlance } from "@/components/agent/desk-glance";
import { DeskStatus } from "@/components/agent/desk-status";
import { DeskTerminal } from "@/components/agent/desk-terminal";
import { RecentBoards } from "@/components/recent-boards";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { LiveState, LiveTranscriptLine } from "@/hooks/use-gemini-live";
import type { DashboardStats } from "@/lib/agent/stats";

export type ConsoleSection = "boards" | "chat" | "stats";

const SECTIONS: { id: ConsoleSection; label: string; accessibleLabel: string; glyph: string }[] = [
  { id: "boards", label: "Clients", accessibleLabel: "Clients and Boards", glyph: "▦" },
  { id: "chat", label: "Ask Squirrl", accessibleLabel: "Ask Squirrl — Agent chat", glyph: "◈" },
  { id: "stats", label: "Overview", accessibleLabel: "Overview and Stats", glyph: "◐" },
];

interface DeskConsoleProps {
  open: boolean;
  section: ConsoleSection;
  onSection: (section: ConsoleSection) => void;
  onClose: () => void;
  /** The signed-in name, shown here since the desk header carries no chrome. */
  userName: string;
  stats: DashboardStats;
  voiceLines: LiveTranscriptLine[];
  liveState: LiveState;
  isLive: boolean;
  activeTool: string | null;
  agentEnabled: boolean;
  sendToVoice: (text: string) => boolean;
  onToggleVoice: () => void;
  onMutation: () => void;
  onCreateBoard: () => void;
  /** Boards open beside the orb in split view, never as a navigation. */
  onOpenBoard: (boardId: string) => void;
}

/**
 * Everything the desk used to scatter around the orb, collected into one
 * overlay behind the hamburger: the board list, the agent chat, and the full
 * stats spread. The orb keeps the homepage to itself.
 *
 * Sections stay mounted once opened so the chat transcript and the analyzer
 * canvases survive switching tabs; only the wrapper is hidden.
 */
export function DeskConsole({
  open,
  section,
  onSection,
  onClose,
  userName,
  stats,
  voiceLines,
  liveState,
  isLive,
  activeTool,
  agentEnabled,
  sendToVoice,
  onToggleVoice,
  onMutation,
  onCreateBoard,
  onOpenBoard,
}: DeskConsoleProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div
      className={`desk-console${open ? " open" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Squirrl console"
      aria-hidden={!open}
      inert={!open}
    >
      <button
        type="button"
        className="desk-console-scrim"
        aria-label="Close console"
        onClick={onClose}
      />

      <div className="desk-console-shell">
        <header className="desk-console-head">
          <span className="desk-console-title">
            ◈ {userName} · {stats.totals.boards} board{stats.totals.boards === 1 ? "" : "s"}
          </span>
          <nav className="desk-console-nav" aria-label="Console sections">
            {SECTIONS.map(({ id, label, accessibleLabel, glyph }) => (
              <button
                key={id}
                type="button"
                className="desk-console-tab"
                aria-label={accessibleLabel}
                aria-pressed={section === id}
                onClick={() => onSection(id)}
              >
                <i aria-hidden>{glyph}</i> {label}
              </button>
            ))}
          </nav>
          <div className="desk-console-actions">
            <button type="button" className="desk-console-btn" onClick={onCreateBoard}>
              ＋ New client
            </button>
            <SignOutButton className="desk-signout" />
            <button
              type="button"
              className="desk-console-close"
              onClick={onClose}
              aria-label="Close console"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="desk-console-body">
          <div className="desk-console-pane" hidden={section !== "boards"}>
            <DeskDataCenter
              stats={stats}
              mobileOpen
              recent={<RecentBoards onOpen={onOpenBoard} />}
              onOpenBoard={onOpenBoard}
            />
          </div>

          <div className="desk-console-pane" hidden={section !== "chat"}>
            <DeskTerminal
              voiceLines={voiceLines}
              liveState={liveState}
              isLive={isLive}
              activeTool={activeTool}
              agentEnabled={agentEnabled}
              sendToVoice={sendToVoice}
              onToggleVoice={onToggleVoice}
              onMutation={onMutation}
              mobileOpen
            />
          </div>

          <div className="desk-console-pane desk-console-stats" hidden={section !== "stats"}>
            <DeskGlance stats={stats} />
            <DeskStatus stats={stats} mobileOpen />
            <DeskAnalyzer stats={stats} mobileOpen />
          </div>
        </div>
      </div>
    </div>
  );
}
