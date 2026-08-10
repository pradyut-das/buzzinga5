"use client";

import { useMemo } from "react";
import type { LiveState } from "@/hooks/use-gemini-live";

const STATE_COPY: Record<LiveState, { title: string; hint: string }> = {
  idle: { title: "Talk to Squirrl", hint: "Click or press space" },
  connecting: { title: "Connecting", hint: "Opening the voice channel" },
  listening: { title: "Listening", hint: "Microphone is open" },
  thinking: { title: "Working", hint: "Reading the agency" },
  speaking: { title: "Answering", hint: "Squirrl is speaking" },
  error: { title: "Voice offline", hint: "Click to retry" },
};

const WAVE_BAR_IDS = Array.from({ length: 13 }, (_, index) => `wave-bar-${index + 1}`);

/**
 * The microphone. State is never colour alone: every state carries a label, a
 * waveform or a static ring, and a screen-reader status, per the v2 spec.
 */
export function LiveOrb({
  state,
  level,
  disabled,
  compact,
  onToggle,
  activeTool,
}: {
  state: LiveState;
  level: number;
  disabled?: boolean;
  compact?: boolean;
  onToggle: () => void;
  activeTool?: string | null;
}) {
  const copy = STATE_COPY[state];
  const bars = useMemo(
    () =>
      WAVE_BAR_IDS.map((id, index) => {
        const base = 8 + Math.abs(Math.sin(index * 1.7)) * 14;
        return { id, height: Math.round(base + level * 60 * Math.abs(Math.sin(index * 0.8 + 1))) };
      }),
    [level],
  );

  if (compact) {
    return (
      <button
        type="button"
        className="sq-floating-orb"
        onClick={onToggle}
        disabled={disabled}
        aria-label={state === "idle" ? "Talk to Squirrl" : `Squirrl: ${copy.title}. Stop.`}
        title={disabled ? "Voice agent offline" : copy.title}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className={`sq-orb${state === "listening" ? " listening" : ""}`}
        onClick={onToggle}
        disabled={disabled}
        aria-label={state === "idle" ? "Talk to Squirrl" : `Squirrl: ${copy.title}. Stop.`}
      >
        <span className="sq-orb-particles" aria-hidden />
        <span className="sq-orb-center">
          <b>{disabled ? "Voice offline" : copy.title}</b>
          <span>{disabled ? "Set GEMINI_API_KEY" : (activeTool ?? copy.hint)}</span>
        </span>
      </button>

      {(state === "listening" || state === "speaking") && (
        <div className="sq-voicewave" aria-hidden>
          {bars.map(({ id, height }) => (
            <i key={id} style={{ ["--h" as string]: `${height}px` }} />
          ))}
        </div>
      )}

      <p role="status" className="sr-only">
        Squirrl {copy.title}. {activeTool ?? copy.hint}.
      </p>
    </>
  );
}
