"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DeskParticles, DeskPreloader } from "@/components/agent/desk-ambient";
import { DeskConsole, type ConsoleSection } from "@/components/agent/desk-console";
import { DeskOrb } from "@/components/agent/desk-orb";
import { SquirrlClientRail } from "@/components/agent/squirrl-client-rail";
import { SquirrlHome } from "@/components/agent/squirrl-home";
import { BoardPane } from "@/components/board/board-pane";
import { CreateBoardDialog } from "@/components/create-board-dialog";
import { useGeminiLive } from "@/hooks/use-gemini-live";
import type { DashboardStats } from "@/lib/agent/stats";

const POLL_MS = 30_000;

interface CreatorDashboardProps {
  userName: string;
  initialStats: DashboardStats;
  /** False when GEMINI_API_KEY is unset — the desk still works, the agent does not. */
  agentEnabled: boolean;
}

/**
 * The creator desk. Empty, it is the orb and nothing else; open a board and
 * the board takes the whole page while the orb shrinks into a floating button
 * in the corner — the voice session never unmounts, so Gemini stays live
 * across the switch. Boards, chat and stats all live behind the hamburger.
 */
export function CreatorDashboard({ userName, initialStats, agentEnabled }: CreatorDashboardProps) {
  const [stats, setStats] = useState(initialStats);
  const [createOpen, setCreateOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [section, setSection] = useState<ConsoleSection>("boards");
  const [boardId, setBoardId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/agent/stats", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as DashboardStats;
      if (mountedRef.current && payload.totals) setStats(payload);
    } catch {
      // A dropped poll just leaves the previous numbers on the plate.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const live = useGeminiLive({ onMutation: () => void refresh() });

  const toggleVoice = useCallback(() => {
    if (!agentEnabled) return;
    if (live.isLive) live.stop();
    else void live.start();
  }, [agentEnabled, live]);

  const openConsole = useCallback((next: ConsoleSection) => {
    setSection(next);
    setConsoleOpen(true);
  }, []);

  const openBoard = useCallback((next: string) => {
    setBoardId(next);
    setConsoleOpen(false);
  }, []);

  // Delivery pressure spins the orb faster when the planner is under strain.
  const pressure = Math.min(
    1,
    (stats.totals.blocked * 2 + stats.totals.stale + stats.totals.unassigned) /
      Math.max(stats.totals.open, 1),
  );

  const onBoard = Boolean(boardId);
  const activeBoardTitle = stats.boards.find((board) => board.id === boardId)?.title;

  return (
    <div className={`desk-shell app-canvas${onBoard ? " on-board" : ""}`}>
      <SquirrlClientRail
        boards={stats.boards}
        activeBoardId={boardId}
        onHome={() => {
          setBoardId(null);
          setConsoleOpen(false);
        }}
        onOpenBoard={openBoard}
        onOpenBoards={() => openConsole("boards")}
        onOpenStats={() => openConsole("stats")}
        onCreateBoard={() => setCreateOpen(true)}
      />

      {boardId ? (
        <div className="squirrl-board-top">
          <span>{activeBoardTitle ?? "Client"} / Content board</span>
          <button type="button" onClick={() => openConsole("chat")}>
            ✦ Ask Squirrl on this board
          </button>
        </div>
      ) : null}

      {boardId && (
        <BoardPane
          key={boardId}
          boardId={boardId}
          onClose={() => {
            setBoardId(null);
            // Board edits move the numbers the desk is showing.
            void refresh();
          }}
        />
      )}

      {/* The plate is the whole page when no board is open and a corner button
          when one is. Either way the orb component stays mounted, so an open
          voice session survives opening and closing boards. */}
      <div className="creator-desk">
        <div className="desk-grid" aria-hidden />
        <DeskOrb
          state={live.state}
          inputLevel={live.inputLevel}
          outputLevel={live.outputLevel}
          pressure={pressure}
          compact={onBoard}
          onToggle={toggleVoice}
        />
        {!onBoard && <DeskParticles />}
        {!onBoard && (
          <SquirrlHome
            stats={stats}
            liveState={live.state}
            agentEnabled={agentEnabled}
            onOpenBoard={openBoard}
            onOpenChat={() => openConsole("chat")}
            onOpenStats={() => openConsole("stats")}
            onOpenApprovals={() => openConsole("boards")}
          />
        )}
      </div>

      <header className="desk-header">
        <button
          type="button"
          className={`desk-ham${consoleOpen ? " open" : ""}`}
          onClick={() => (consoleOpen ? setConsoleOpen(false) : openConsole(section))}
          aria-expanded={consoleOpen}
          aria-label={consoleOpen ? "Close console" : "Open console"}
          title="Boards, chat and stats"
        >
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
        </button>
        {!onBoard && (
          <h1 className="desk-wordmark">
            Squirrl <small>· creator desk</small>
          </h1>
        )}
      </header>

      <DeskConsole
        open={consoleOpen}
        section={section}
        onSection={setSection}
        onClose={() => setConsoleOpen(false)}
        userName={userName}
        stats={stats}
        voiceLines={live.transcript}
        liveState={live.state}
        isLive={live.isLive}
        activeTool={live.activeTool}
        agentEnabled={agentEnabled}
        sendToVoice={live.sendText}
        onToggleVoice={toggleVoice}
        onMutation={() => void refresh()}
        onCreateBoard={() => setCreateOpen(true)}
        onOpenBoard={openBoard}
      />

      {!onBoard && <DeskPreloader label="Reading planner state" />}

      <CreateBoardDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
