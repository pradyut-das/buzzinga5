"use client";

import { useEffect, useRef } from "react";
import type { LiveState } from "@/hooks/use-gemini-live";

interface DeskOrbProps {
  state: LiveState;
  inputLevel: number;
  outputLevel: number;
  /** 0–1 delivery pressure; a strained board makes the orb turn faster. */
  pressure: number;
  /**
   * True when the orb is the corner button rather than the whole plate. The
   * cloud is redrawn thinner there: at 120px the full-page density packs into
   * a solid disc, so compact uses fewer, finer points to stay a sphere.
   */
  compact?: boolean;
  onToggle: () => void;
}

interface OrbPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * The orb, ported from the Squirrl dashboard: a rotating point-cloud sphere
 * drawn on a full-bleed 2D canvas — no WebGL, so it stays cheap and works
 * everywhere. Depth becomes dot size and alpha, audio level shears and inflates
 * the sphere, and the colour carries the session state.
 *
 * The whole plate is the microphone button, exactly as in the reference.
 */
export function DeskOrb({
  state,
  inputLevel,
  outputLevel,
  pressure,
  compact = false,
  onToggle,
}: DeskOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef({
    state,
    inputLevel,
    outputLevel,
    pressure,
    compact,
    hovered: false,
  });
  liveRef.current = {
    ...liveRef.current,
    state,
    inputLevel,
    outputLevel,
    pressure,
    compact,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // A ring-per-latitude cloud gives an even distribution without needing a mesh.
    const points: OrbPoint[] = [];
    const rings = compact ? 13 : 22;
    for (let i = 0; i < rings; i += 1) {
      const phi = (Math.PI * (i + 0.5)) / rings;
      const count = Math.max(5, Math.round(Math.sin(phi) * (compact ? 22 : 46)));
      for (let j = 0; j < count; j += 1) {
        const theta = (2 * Math.PI * j) / count;
        points.push({
          x: Math.sin(phi) * Math.cos(theta),
          y: Math.cos(phi),
          z: Math.sin(phi) * Math.sin(theta),
        });
      }
    }

    const orb = {
      rotation: 0,
      level: 0,
      outputLevel: 0,
      skewX: 0,
      skewY: 0,
      glow: 0,
      scale: 1,
      hoverFactor: 0,
    };

    let raf = 0;
    const draw = (time: number) => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const centreX = width / 2;
      const centreY = height / 2;
      const current = liveRef.current;
      const base = Math.min(width, height) * (current.compact ? 0.32 : 0.128);

      // Every reactive value is eased toward its target so the orb never snaps.
      const listening = current.state === "listening";
      const speaking = current.state === "speaking";
      const rawLevel = listening ? Math.min(1, current.inputLevel * 3.2) : 0;
      orb.level += (rawLevel - orb.level) * (rawLevel > orb.level ? 0.35 : 0.08);

      const outputTarget = speaking ? Math.min(1, current.outputLevel * 2.2) : 0;
      orb.outputLevel +=
        (outputTarget - orb.outputLevel) * (outputTarget > orb.outputLevel ? 0.38 : 0.1);

      const reactiveLevel = speaking ? orb.outputLevel : orb.level;
      const reacting = listening || speaking;
      // Gemini's own speech should shape the orb, not visibly warp it, so the
      // microphone response stays a little stronger.
      const skewStrengthX = speaking ? 0.26 : 0.34;
      const skewStrengthY = speaking ? 0.16 : 0.22;
      const targetSkewX = reacting ? Math.sin(time / 390) * reactiveLevel * skewStrengthX : 0;
      const targetSkewY = reacting ? Math.cos(time / 470) * reactiveLevel * skewStrengthY : 0;
      orb.skewX += (targetSkewX - orb.skewX) * 0.12;
      orb.skewY += (targetSkewY - orb.skewY) * 0.12;

      const targetGlow =
        current.state === "thinking"
          ? 0.62
          : current.state === "error"
            ? 0.3
            : listening
              ? 0.35 + orb.level * 0.5
              : 0;
      orb.glow += (targetGlow - orb.glow) * 0.12;

      const breathe = 1 + Math.sin(time / 1400) * 0.03;
      const targetScale = speaking
        ? 1.34 + orb.outputLevel * 0.12
        : listening
          ? 0.82
          : current.state === "connecting"
            ? 1.08
            : 1;
      orb.scale += (targetScale - orb.scale) * 0.075;

      const inputExpansion = listening ? orb.level * 0.18 : 0;
      const radius =
        base * breathe * orb.scale * (1 + current.pressure * 0.16) * (1 + inputExpansion);

      const rgb =
        current.state === "thinking"
          ? "255, 45, 45"
          : current.state === "error"
            ? "255, 90, 70"
            : listening
              ? "255, 194, 28"
              : speaking
                ? "120, 200, 255"
                : "255, 194, 28";

      orb.hoverFactor += ((current.hovered ? 1 : 0) - orb.hoverFactor) * 0.12;
      const hoverSpeed = 1 - orb.hoverFactor * 0.82;
      orb.rotation += (0.0022 + current.pressure * 0.004 + reactiveLevel * 0.012) * hoverSpeed;

      const cos = Math.cos(orb.rotation);
      const sin = Math.sin(orb.rotation);
      const tilt = Math.sin(time / 5200) * 0.25;

      for (const point of points) {
        const x0 = point.x * cos - point.z * sin;
        const z = point.x * sin + point.z * cos;
        const y0 = point.y * Math.cos(tilt) - z * Math.sin(tilt);
        // Shearing makes loud speech lean the sphere rather than only inflate it.
        const x = x0 + orb.skewX * y0;
        const y = y0 + orb.skewY * x0;
        const depth = (z + 1) / 2;
        const size = current.compact
          ? 0.3 + depth * 0.85 + orb.level * 0.4
          : 0.5 + depth * 1.6 + orb.level * 0.8;
        context.beginPath();
        context.arc(centreX + x * radius, centreY + y * radius, size, 0, Math.PI * 2);
        context.fillStyle = `rgba(${rgb}, ${0.08 + depth * 0.55})`;
        context.fill();
      }

      context.fillStyle = `rgba(${rgb}, ${orb.glow * 0.16})`;
      context.beginPath();
      context.arc(centreX, centreY, radius * 1.6, 0, Math.PI * 2);
      context.fill();

      // White rings belong exclusively to the speaking state.
      if (speaking) {
        for (const [scale, alpha] of [
          [1.16, 0.78],
          [1.3, 0.28],
        ]) {
          context.save();
          context.translate(centreX, centreY);
          context.transform(1, orb.skewY, orb.skewX, 1, 0, 0);
          context.beginPath();
          context.arc(0, 0, radius * scale, 0, Math.PI * 2);
          context.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, alpha + orb.outputLevel * 0.16)})`;
          context.lineWidth = (scale < 1.2 ? 1.8 : 1) + orb.outputLevel * 1.4;
          context.stroke();
          context.restore();
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // The point cloud itself changes with `compact`, so it is rebuilt here.
  }, [compact]);

  const live = state !== "idle" && state !== "error";

  return (
    <button
      type="button"
      className="desk-orb"
      onClick={onToggle}
      onPointerEnter={() => {
        liveRef.current.hovered = true;
      }}
      onPointerLeave={() => {
        liveRef.current.hovered = false;
      }}
      aria-pressed={live}
      aria-label={live ? "Stop the voice agent" : "Click to speak an instruction"}
    >
      <canvas ref={canvasRef} />
    </button>
  );
}
