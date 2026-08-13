"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Mic, Sparkles, Square, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { PlasmaVoiceVisualizer } from "@/components/reference/plasma-voice-visualizer";
import { useGeminiLive } from "@/hooks/use-gemini-live";

export interface PlannerEvent {
  id: string;
  clientId: string;
  clientName: string;
  clientColor: string;
  title: string;
  at: string;
}

const statusLabel = {
  idle: "Idle",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Processing",
  speaking: "Speaking",
  error: "Unavailable",
} as const;

export function VoicePlanner({
  agentEnabled,
  events,
}: {
  agentEnabled: boolean;
  events: PlannerEvent[];
}) {
  const router = useRouter();
  const live = useGeminiLive({ onMutation: () => router.refresh() });
  const latestReply = live.transcript.findLast((line) => line.role === "agent")?.text;
  const latestUser = live.transcript.findLast((line) => line.role === "you")?.text;
  const level = live.state === "speaking" ? live.outputLevel : live.inputLevel;
  const toggle = useCallback(() => {
    if (!agentEnabled) return;
    if (live.isLive) live.stop();
    else void live.start();
  }, [agentEnabled, live]);

  return (
    <>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0">
          <section className="relative min-h-[420px] overflow-hidden rounded-[22px] border border-[#dfe8f2] bg-[#f7faff] shadow-[0_18px_48px_rgba(59,91,137,.10)] sm:min-h-[500px]">
            <PlasmaVoiceVisualizer state={live.state} level={level} />
            <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_38%,rgba(247,250,255,.05)_68%,rgba(231,239,248,.24)_100%)]" />
            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-5 sm:p-6">
              <div className="flex items-center gap-2 text-sm font-medium text-[#475467]">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${live.isLive ? "bg-emerald-500" : "bg-slate-300"}`}
                />
                {agentEnabled ? statusLabel[live.state] : "Voice not configured"}
              </div>
              {live.activeTool && (
                <span className="rounded-full border border-[#dfe8f2] bg-white/75 px-3 py-1.5 text-xs font-medium capitalize text-[#475467] backdrop-blur-sm">
                  {live.activeTool.replaceAll("_", " ")}
                </span>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-7 z-20 flex justify-center sm:bottom-9">
              <motion.button
                type="button"
                aria-label={live.isLive ? "End voice session" : "Start voice session"}
                disabled={!agentEnabled}
                onClick={toggle}
                animate={
                  live.isLive
                    ? {
                        boxShadow: ["0 0 0 0 rgba(37,99,235,.18)", "0 0 0 14px rgba(37,99,235,0)"],
                      }
                    : {}
                }
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="grid h-16 w-16 place-items-center rounded-full border border-[#d9e4f0] bg-white text-[#0f172a] shadow-[0_10px_28px_rgba(59,91,137,.16)] transition hover:scale-[1.04] disabled:cursor-not-allowed disabled:bg-white/70 disabled:text-slate-400 sm:h-[72px] sm:w-[72px]"
              >
                {live.isLive ? (
                  <Square className="h-5 w-5 fill-current" aria-hidden />
                ) : (
                  <Mic className="h-7 w-7" strokeWidth={2.2} aria-hidden />
                )}
              </motion.button>
            </div>
          </section>

          <section aria-live="polite" className="mx-auto max-w-3xl px-2 pb-4 pt-8 text-center">
            {latestUser && (
              <p className="mb-3 text-sm leading-6 text-muted">
                <span className="font-medium text-[#475467]">You:</span> {latestUser}
              </p>
            )}
            <p className="text-xl font-medium leading-8 tracking-[-0.015em] text-ink sm:text-2xl sm:leading-9">
              {latestReply ||
                live.detail ||
                (agentEnabled
                  ? "Tap the microphone and ask Squirrl about your client work."
                  : "Configure Gemini Live to start a voice conversation.")}
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
              <span
                className={`h-2 w-2 rounded-full ${live.isLive ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              {live.isLive ? "Conversation live" : "Ready when you are"}
            </div>
          </section>
        </main>
        <TodayCard events={events} />
      </div>

      <AnimatePresence>
        {live.pendingWrite && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/20 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.section
              role="alertdialog"
              aria-modal="true"
              aria-label="Confirm change"
              className="w-full max-w-md rounded-[18px] border border-line bg-white p-6 shadow-modal"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
            >
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Confirm change</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{live.pendingWrite.summary}</p>
              <p className="mt-3 text-xs text-muted">Nothing is written until you approve it.</p>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={live.cancelWrite}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-[#475467] hover:bg-slate-50"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={live.approveWrite}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function TodayCard({ events }: { events: PlannerEvent[] }) {
  return (
    <aside className="h-fit rounded-[18px] border border-line bg-white p-6 shadow-soft xl:sticky xl:top-[106px]">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">Today</h2>
        <Sparkles className="h-4 w-4 text-slate-300" aria-hidden />
      </div>
      <div className="mt-5 divide-y divide-line">
        {events.length ? (
          events.map((event) => (
            <Link
              key={event.id}
              href={`/clients/${event.clientId}`}
              className="flex gap-3 py-4 first:pt-1"
            >
              <span
                className="mt-1.5 h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: event.clientColor }}
              />
              <span>
                <span className="block text-sm text-muted">{event.at}</span>
                <span className="mt-1 block text-sm font-semibold text-ink">{event.title}</span>
                <span className="mt-1 block text-sm text-muted">{event.clientName}</span>
              </span>
            </Link>
          ))
        ) : (
          <p className="py-4 text-sm leading-6 text-muted">No work is scheduled for today.</p>
        )}
      </div>
      <Link href="/calendar" className="mt-3 inline-flex text-sm font-semibold text-primary">
        View calendar →
      </Link>
    </aside>
  );
}
