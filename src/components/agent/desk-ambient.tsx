"use client";

import { useEffect, useRef } from "react";

/**
 * The reference's ambient layer: 26 specks drifting upward over the starfield.
 * Positions are written straight to style so this never re-renders React.
 */
export function DeskParticles() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const nodes = Array.from({ length: 26 }, () => {
      const node = document.createElement("span");
      host.append(node);
      return { node, x: Math.random(), y: Math.random(), speed: 0.00002 + Math.random() * 0.00006 };
    });

    let last = 0;
    let raf = 0;
    const frame = (time: number) => {
      const delta = last ? time - last : 16;
      last = time;
      for (const particle of nodes) {
        particle.y -= particle.speed * delta;
        if (particle.y < -0.02) {
          particle.y = 1.02;
          particle.x = Math.random();
        }
        particle.node.style.left = `${particle.x * 100}%`;
        particle.node.style.top = `${particle.y * 100}%`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      nodes.forEach((particle) => particle.node.remove());
    };
  }, []);

  return <div ref={hostRef} className="desk-particles" aria-hidden />;
}

/**
 * The reference's preloader ring, covering the first paint while the plate
 * settles. It fades out on a CSS animation rather than React state, and is
 * never interactive — an overlay that outlives its welcome must not be able to
 * swallow clicks on the desk beneath it.
 */
export function DeskPreloader({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let raf = 0;
    const draw = (time: number) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      const centre = canvas.width / 2;
      for (let ring = 0; ring < 3; ring += 1) {
        const radius = 30 + ring * 22;
        const offset = time / (600 + ring * 320);
        context.beginPath();
        context.arc(centre, centre, radius, offset, offset + Math.PI * (1.2 - ring * 0.25));
        context.strokeStyle = `rgba(255, 194, 28, ${0.7 - ring * 0.18})`;
        context.lineWidth = 2;
        context.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const stop = setTimeout(() => cancelAnimationFrame(raf), 2000);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stop);
    };
  }, []);

  return (
    <div className="desk-loading" aria-hidden>
      <canvas ref={canvasRef} width={180} height={180} />
      <p className="desk-loading-text">{label}</p>
    </div>
  );
}
