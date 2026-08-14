"use client";

import { Plasma, type PlasmaConfig, type PlasmaRef } from "@pipecat-ai/voice-ui-kit/webgl";
import { useEffect, useRef } from "react";
import type { LiveState } from "@/hooks/use-gemini-live";

// These are the exact state presets used by Voice UI Kit's PlasmaVisualizer.
// The palette is tinted to the platform's amber gold theme.
const amberColors = {
  useCustomColors: true,
  color1: "#ffe082",
  color2: "#ffb300",
  color3: "#ff8f00",
  backgroundColor: "#2a1f05",
} as const;

const idleConfig: PlasmaConfig = {
  effectScale: 0.55,
  ringDistance: 0,
  ringBounce: 0,
  ringVariance: 0.35,
  ringAmplitude: 0.03,
  ringVisibility: 0.32,
  ringSegments: 6,
  ringThickness: 8,
  ringSpread: 0.08,
  colorCycleSpeed: 0.5,
  intensity: 1.95,
  radius: 1.65,
  glowFalloff: 1,
  glowThreshold: 0,
  plasmaSpeed: 0.3,
  rayLength: 1,
  ...amberColors,
};

const thinkingConfig: PlasmaConfig = {
  ringDistance: 0.05,
  ringBounce: 0.25,
  ringVariance: 0,
  ringAmplitude: 0,
  ringVisibility: 0.3,
  ringThickness: 18,
  colorCycleSpeed: 3,
  intensity: 2,
  radius: 2,
  glowThreshold: 0,
  glowFalloff: 0.5,
  plasmaSpeed: 3,
  rayLength: 1,
  ...amberColors,
};

export function PlasmaVoiceVisualizer({ state, level }: { state: LiveState; level: number }) {
  const plasmaRef = useRef<PlasmaRef>(null);

  useEffect(() => {
    const active = state === "thinking" || state === "connecting";
    const base = active ? thinkingConfig : idleConfig;
    const response = Math.min(1, Math.max(0, level));

    plasmaRef.current?.updateConfig({
      ...base,
      intensity: (base.intensity ?? 1.95) * (1 + response * 0.9),
      radius: (base.radius ?? 1.65) * (1 + response * 0.32),
      effectScale: (base.effectScale ?? 0.55) * (1 - response * 0.18),
      ringVisibility: Math.min(1, (base.ringVisibility ?? 0.32) + response * 0.68),
      ringThickness: (base.ringThickness ?? 8) * (1 + response * 1.2),
      ringAmplitude: Math.max(base.ringAmplitude ?? 0, response * 0.08),
      plasmaSpeed: (base.plasmaSpeed ?? 0.3) * (1 + response * 2.2),
    });
  }, [level, state]);

  return (
    <Plasma
      ref={plasmaRef}
      initialConfig={idleConfig}
      className="absolute inset-0 pointer-events-none z-0"
      fallbackContent={
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#ffe082_0,#ffb300_24%,#2a1f05_62%)]" />
      }
    />
  );
}
