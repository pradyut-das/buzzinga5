"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatToolTrace, ChatTurn } from "@/app/api/agent/chat/route";
import type { LiveState, LiveTranscriptLine } from "@/hooks/use-gemini-live";

interface Message {
  id: string;
  role: "you" | "agent" | "system" | "error";
  text: string;
  trace?: ChatToolTrace[];
}

interface DeskTerminalProps {
  voiceLines: LiveTranscriptLine[];
  liveState: LiveState;
  isLive: boolean;
  activeTool: string | null;
  /** False when GEMINI_API_KEY is unset: neither surface can reach the model. */
  agentEnabled: boolean;
  sendToVoice: (text: string) => boolean;
  onToggleVoice: () => void;
  onMutation: () => void;
  mobileOpen: boolean;
}

const STATE_LINE: Record<LiveState, string> = {
  idle: "Ask anything, or state a change. Click the orb to speak.",
  connecting: "Opening the voice channel…",
  listening: "Listening — microphone is open",
  thinking: "Querying the planner database",
  speaking: "Responding",
  error: "Voice channel failed",
};

/**
 * The reference's chat terminal, wired to both agent surfaces. Typing while a
 * voice session is open sends into that session, so the agent keeps one thread
 * of context instead of two that disagree.
 */
export function DeskTerminal({
  voiceLines,
  liveState,
  isLive,
  activeTool,
  agentEnabled,
  sendToVoice,
  onToggleVoice,
  onMutation,
  mobileOpen,
}: DeskTerminalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    const fresh = voiceLines.filter((line) => !seenRef.current.has(line.id));
    if (!fresh.length) return;
    fresh.forEach((line) => seenRef.current.add(line.id));
    setMessages((current) => [
      ...current,
      ...fresh.map((line) => ({ id: line.id, role: line.role, text: line.text })),
    ]);
  }, [voiceLines]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const send = async () => {
    const text = draft.trim();
    if (!text || pending) return;

    setDraft("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "you", text }]);
    if (isLive && sendToVoice(text)) return;

    setPending(true);
    try {
      const history: ChatTurn[] = messages
        .filter((message) => message.role === "you" || message.role === "agent")
        .map((message) => ({
          role: message.role === "you" ? ("user" as const) : ("model" as const),
          text: message.text,
        }));

      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        trace?: ChatToolTrace[];
        error?: string;
      };

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: payload.error ? "error" : "agent",
          text: payload.error ?? payload.reply ?? "No answer came back.",
          trace: payload.trace,
        },
      ]);
      if (payload.trace?.some((entry) => entry.status === "executed")) onMutation();
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "error", text: "The agent did not respond. Try again." },
      ]);
    } finally {
      setPending(false);
    }
  };

  const stateTone = !agentEnabled
    ? "risk"
    : liveState === "error"
      ? "late"
      : liveState === "thinking"
        ? "risk"
        : isLive
          ? "clear"
          : "";
  const stateLine = !agentEnabled
    ? "Agent offline — set GEMINI_API_KEY to enable voice and chat"
    : activeTool
      ? `Running ${activeTool}…`
      : STATE_LINE[liveState];

  return (
    <section className={`desk-terminal${mobileOpen ? " mobile-open" : ""}`} aria-label="Agent chat">
      <div className="desk-terminal-head">
        <span>◈ Squirrl agent</span>
        <span className="desk-clock">{isLive ? "voice + text" : "text"}</span>
      </div>

      <div className={`desk-terminal-state ${stateTone}`}>{stateLine}</div>

      <div ref={bodyRef} className="desk-terminal-body">
        {!messages.length && (
          <p className="desk-line system">
            Connected. Ask anything, state a change, or say “add priya@example.com to the marketing
            board”.
          </p>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`desk-line ${message.role}`}>
            {message.text}
            {message.trace?.length ? (
              <ul className="desk-trace">
                {message.trace.map((entry, index) => (
                  <li key={`${entry.name}-${index}`}>
                    {entry.name} — {entry.status}
                    {entry.detail && entry.detail !== "read" ? `: ${entry.detail}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}

        {pending && <p className="desk-line system">Reading the planner…</p>}
      </div>

      <form
        className="desk-input-bar"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <button
          type="button"
          className={`desk-btn desk-mic${isLive ? " listening" : ""}`}
          onClick={onToggleVoice}
          disabled={!agentEnabled}
          aria-pressed={isLive}
          aria-label={isLive ? "Stop the voice agent" : "Start the voice agent"}
          title={isLive ? "Stop the voice agent" : "Speak"}
        >
          {isLive ? "■" : "◉"}
        </button>
        <input
          className="desk-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            isLive ? "Type into the voice conversation…" : "Ask anything, or say a change…"
          }
          maxLength={2000}
          aria-label="Message the agent"
        />
        <button type="submit" className="desk-btn desk-send" disabled={pending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
