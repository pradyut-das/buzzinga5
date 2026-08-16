"use client";

import { useEffect, useState } from "react";

type EyeState = 0 | 1 | 2 | 3;

/**
 * The four eye states from the brand sheet: open, top-lidded, bottom-lidded,
 * and squinting. A blink runs 0 -> 1 -> 2 -> 3 -> 2 -> 1 -> 0 so the lids read
 * as closing and reopening rather than snapping between poses.
 */
const BLINK: readonly EyeState[] = [1, 2, 3, 2, 1, 0];
const FRAME_MS = 70;

const EYES: Record<EyeState, React.ReactNode> = {
  0: (
    <>
      <circle cx="40" cy="50" r="7.5" />
      <circle cx="60" cy="50" r="7.5" />
    </>
  ),
  1: (
    <>
      <path d="M32.5 50 A7.5 7.5 0 0 0 47.5 50 Z" />
      <path d="M52.5 50 A7.5 7.5 0 0 0 67.5 50 Z" />
    </>
  ),
  2: (
    <>
      <path d="M32.5 53 A7.5 7.5 0 0 1 47.5 53 Z" />
      <path d="M52.5 53 A7.5 7.5 0 0 1 67.5 53 Z" />
    </>
  ),
  3: (
    <>
      <rect x="32.5" y="48" width="15" height="5" />
      <rect x="52.5" y="48" width="15" height="5" />
    </>
  ),
};

/**
 * Blinks on its own every few seconds, and again whenever `trigger` changes so
 * a parent can make the mark react to hover. Respects reduced-motion by
 * holding the open-eyed pose.
 */
function useBlink(trigger: number) {
  const [eye, setEye] = useState<EyeState>(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let step: ReturnType<typeof setTimeout>;

    const run = () => {
      frame = 0;
      const advance = () => {
        const next = BLINK[frame];
        if (next === undefined) return;
        setEye(next);
        frame += 1;
        step = setTimeout(advance, FRAME_MS);
      };
      advance();
    };

    run();
    const idle = setInterval(run, 4200);
    return () => {
      clearInterval(idle);
      clearTimeout(step);
    };
  }, [trigger]);

  return eye;
}

export function SquirlMark({ className, trigger = 0 }: { className?: string; trigger?: number }) {
  const eye = useBlink(trigger);

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <rect width="100" height="100" rx="22" fill="#FFD400" />
      <path
        d="M18 8 L34 34 L50 26 L66 34 L82 8 L88 40 L78 64 L64 82 L36 82 L22 64 L12 40 Z"
        fill="#0b0b0b"
      />
      <g fill="#fff">{EYES[eye]}</g>
    </svg>
  );
}
