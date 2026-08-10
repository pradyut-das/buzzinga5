"use client";

import { useEffect, useRef } from "react";

type Point = {
  x: number;
  y: number;
  z: number;
  size: number;
  drift: number;
};

/**
 * A deliberately small 2D canvas scene shared by every route. It creates a
 * sense of depth without making every screen pay the WebGL cost of the home
 * scene. The UI remains the foreground and the canvas never receives input.
 */
export function GlobalDepthCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastPaint = 0;
    let dark = document.documentElement.classList.contains("dark");
    const pointer = { x: 0, y: 0 };
    let points: Point[] = [];

    const buildPoints = () => {
      const count = width < 700 ? 26 : 52;
      points = Array.from({ length: count }, (_, index) => ({
        x: ((index * 83) % 101) / 101,
        y: ((index * 47 + 17) % 97) / 97,
        z: 0.2 + ((index * 29) % 73) / 100,
        size: 0.7 + ((index * 11) % 9) / 10,
        drift: index % 2 ? 1 : -1,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildPoints();
    };

    const draw = (time = 0) => {
      context.clearRect(0, 0, width, height);
      const amber = dark ? "rgba(242,182,50,0.26)" : "rgba(139,90,0,0.18)";
      const line = dark ? "rgba(244,241,233,0.08)" : "rgba(29,29,26,0.08)";
      const particle = dark ? "rgba(244,241,233,0.28)" : "rgba(29,29,26,0.22)";
      const elapsed = reduceMotion.matches ? 0 : time * 0.000025;

      // A sparse perspective floor: enough to establish a room, never a grid UI.
      context.lineWidth = 1;
      context.strokeStyle = line;
      const horizon = height * 0.62;
      for (let index = -5; index <= 5; index += 1) {
        context.beginPath();
        context.moveTo(width / 2 + pointer.x * 10, horizon);
        context.lineTo(width / 2 + index * width * 0.19, height + 20);
        context.stroke();
      }
      for (let index = 0; index < 7; index += 1) {
        const progress = index / 6;
        const eased = progress * progress;
        const y = horizon + eased * (height - horizon);
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      points.forEach((point, index) => {
        const x =
          point.x * width + pointer.x * 14 * point.z + Math.sin(elapsed * point.drift + index) * 8;
        const y = point.y * height + pointer.y * 9 * point.z + Math.cos(elapsed + index * 0.7) * 5;
        context.fillStyle = index % 8 === 0 ? amber : particle;
        context.beginPath();
        context.arc(x, y, point.size * point.z, 0, Math.PI * 2);
        context.fill();
      });
    };

    const animate = (time: number) => {
      if (time - lastPaint > 32) {
        draw(time);
        lastPaint = time;
      }
      frame = window.requestAnimationFrame(animate);
    };

    const handlePointer = (event: PointerEvent) => {
      pointer.x = event.clientX / Math.max(width, 1) - 0.5;
      pointer.y = event.clientY / Math.max(height, 1) - 0.5;
    };
    const handleMotion = () => {
      window.cancelAnimationFrame(frame);
      if (reduceMotion.matches) draw();
      else frame = window.requestAnimationFrame(animate);
    };
    const themeObserver = new MutationObserver(() => {
      dark = document.documentElement.classList.contains("dark");
      draw();
    });

    resize();
    draw();
    handleMotion();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    reduceMotion.addEventListener("change", handleMotion);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointer);
      reduceMotion.removeEventListener("change", handleMotion);
      themeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="global-depth-canvas" aria-hidden="true" />;
}
