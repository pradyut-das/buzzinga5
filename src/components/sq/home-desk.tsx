"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowUpRight, Check, X } from "lucide-react";
import { JarvisCore } from "@/components/sq/jarvis-core";
import { useGeminiLive } from "@/hooks/use-gemini-live";
import type { DeskUiAnswer } from "@/app/api/agent/chat/route";
import type { ApprovalCard } from "@/lib/agency/queries";

const PRIMARY_PROMPT = "What needs my attention today?";

interface Answer {
  question: string;
  ui: DeskUiAnswer;
  sources: { title: string; detail: string }[];
}

function humanizeToolName(name: string) {
  return name.replace(/_/g, " ").replace(/^./, (character) => character.toUpperCase());
}

/**
 * The founder's homepage. The orb is the microphone and the chips say out
 * loud what the agent can do — read the agency, or change it. Asking a question replaces the orbit with a
 * structured brief rather than a chat log.
 */
export function HomeDesk({
  approvals,
  agentEnabled,
  headline,
}: {
  approvals: ApprovalCard[];
  agentEnabled: boolean;
  headline: string;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askingQuestion, setAskingQuestion] = useState("");
  const [prompt, setPrompt] = useState("");
  const requestRef = useRef(0);
  // The modal portals to <body>: .sq-main's backdrop-filter would otherwise
  // become the containing block for position:fixed and clip it away.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const live = useGeminiLive({ onMutation: () => router.refresh() });

  const pendingWrite = live.pendingWrite;
  const cancelWrite = live.cancelWrite;
  useEffect(() => {
    if (!pendingWrite) return;
    // Escape is a no on a prepared write.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelWrite();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingWrite, cancelWrite]);

  const toggleVoice = useCallback(() => {
    if (!agentEnabled) return;
    if (live.isLive) live.stop();
    else void live.start();
  }, [agentEnabled, live]);

  const ask = useCallback(async (question: string) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setAsking(true);
    setAskingQuestion(question);
    setAnswer(null);
    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history: [], responseMode: "desk" }),
      });
      const payload = (await response.json()) as {
        reply?: string;
        error?: string;
        ui?: DeskUiAnswer;
        trace?: { name: string; status: string; detail?: string }[];
      };
      const reply = payload.error ?? payload.reply ?? "No answer came back.";
      const [first, ...rest] = reply.split(/\n+/);
      if (requestRef.current !== requestId) return;
      setAnswer({
        question,
        ui: payload.ui ?? {
          headline: first,
          summary: rest.join(" "),
          facts: [],
          nextActions: [],
        },
        sources: (payload.trace ?? []).map((entry) => ({
          title: humanizeToolName(entry.name),
          detail: entry.detail ?? entry.status,
        })),
      });
    } catch {
      if (requestRef.current !== requestId) return;
      setAnswer({
        question,
        ui: {
          headline: "I couldn't build that answer",
          summary: "The desk could not reach Squirrl. Try the question again.",
          facts: [],
          nextActions: [],
        },
        sources: [],
      });
    } finally {
      if (requestRef.current === requestId) setAsking(false);
    }
  }, []);

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = prompt.trim();
    if (!question) return;
    setPrompt("");
    void ask(question);
  };

  // Answer view: one query-shaped surface, with no generic dashboard attached.
  if (answer || asking) {
    return (
      <main className="sq-main">
        <header className="sq-top">
          <span className="sq-crumb">Desk / Answer</span>
          <div className="sq-top-actions">
            <button
              type="button"
              className="sq-pill"
              onClick={() => {
                requestRef.current += 1;
                setAsking(false);
                setAskingQuestion("");
                setAnswer(null);
              }}
            >
              Back to desk
            </button>
          </div>
        </header>

        <div className="sq-answer-shell" aria-live="polite">
          <section
            className={`sq-panel sq-answer${asking ? " is-loading" : ""}`}
            aria-busy={asking}
          >
            <div className="sq-question">
              YOU ASKED · “{answer?.question ?? (askingQuestion || "…")}”
            </div>
            {asking && (
              <div className="sq-answer-loading">
                <i aria-hidden />
                <h2>Building the answer…</h2>
                <p>Reading only what this question needs.</p>
              </div>
            )}
            {answer && (
              <>
                <h2>{answer.ui.headline}</h2>
                {answer.ui.summary && <p className="sq-answer-lede">{answer.ui.summary}</p>}

                {answer.ui.facts.length > 0 && (
                  <dl className="sq-answer-facts">
                    {answer.ui.facts.map((fact, index) => (
                      <div
                        key={`${fact.label}-${index}`}
                        className={`sq-answer-fact ${fact.tone ?? "neutral"}`}
                      >
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                        {fact.detail && <p>{fact.detail}</p>}
                      </div>
                    ))}
                  </dl>
                )}

                {(answer.sources.length > 0 || answer.ui.nextActions.length > 0) && (
                  <footer className="sq-answer-footer">
                    {answer.sources.length > 0 && (
                      <details className="sq-evidence">
                        <summary>
                          {answer.sources.length} source{answer.sources.length === 1 ? "" : "s"}
                        </summary>
                        <div className="sq-answer-sources">
                          {answer.sources.map((source, index) => (
                            <span key={`${source.title}-${index}`}>
                              <b>{source.title}</b>
                              {source.detail !== "read" && <i>{source.detail}</i>}
                            </span>
                          ))}
                        </div>
                      </details>
                    )}

                    {answer.ui.nextActions.length > 0 && (
                      <div className="sq-followup" aria-label="Ask a follow-up">
                        {answer.ui.nextActions.map((action) => (
                          <button
                            key={`${action.label}-${action.prompt}`}
                            type="button"
                            onClick={() => void ask(action.prompt)}
                          >
                            {action.label}
                            <ArrowUpRight aria-hidden />
                          </button>
                        ))}
                      </div>
                    )}
                  </footer>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="sq-main sq-home">
      <div className="sq-home-stage">
        <div className="sq-home-label">
          <span>
            {new Date().toLocaleDateString("en-GB", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            })}
          </span>
          <strong>
            {approvals.length
              ? `${approvals.length} approval${approvals.length === 1 ? "" : "s"} need you`
              : "Your desk is clear"}
          </strong>
        </div>

        <JarvisCore
          state={live.state}
          level={live.state === "speaking" ? live.outputLevel : live.inputLevel}
          disabled={!agentEnabled}
          activeTool={live.activeTool}
          onToggle={toggleVoice}
        />

        {live.transcript.length > 0 && live.isLive && (
          <div className="sq-listen-caption">
            <strong>{live.transcript[live.transcript.length - 1]?.text}</strong>
            <span>{headline}</span>
          </div>
        )}

        <div className="sq-capabilities">
          <form className="sq-askbar" onSubmit={submitPrompt}>
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Ask Squirrl anything…"
              aria-label="Ask Squirrl"
            />
            <button type="submit" disabled={!prompt.trim()}>
              Ask
            </button>
          </form>
          <button
            type="button"
            className="sq-example-prompt"
            onClick={() => void ask(PRIMARY_PROMPT)}
          >
            Try “{PRIMARY_PROMPT}”
          </button>
          <details className="sq-capability-help">
            <summary>What can Squirrl do?</summary>
            <p>
              Ask about risks, workload, approvals, or performance. Squirrl can also create, assign,
              move, and update work after you confirm.
            </p>
          </details>
        </div>
      </div>

      {/* Voice writes are approved here, not by anything the model says. */}
      {live.pendingWrite &&
        mounted &&
        createPortal(
          <div className="sq-modal-backdrop" role="presentation">
            <div
              className="sq-modal sq-modal-confirm"
              role="alertdialog"
              aria-modal
              aria-label="Confirm change"
            >
              <header>
                <div>
                  <span className="sq-eyebrow">
                    <AlertCircle size={11} /> Squirrl wants to change something
                  </span>
                  <h2>{live.pendingWrite.summary}</h2>
                </div>
              </header>
              <p className="sq-modal-copy">
                Nothing has been written yet. It only happens if you approve it here.
              </p>
              <footer className="sq-tiny-actions">
                <button type="button" className="sq-tiny" onClick={live.cancelWrite}>
                  <X size={12} /> Cancel
                </button>
                <button type="button" className="sq-tiny primary" onClick={live.approveWrite}>
                  <Check size={12} /> Do it
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </main>
  );
}
