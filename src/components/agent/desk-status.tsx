"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardStats } from "@/lib/agent/stats";

/**
 * The left-hand "agency status" panel from the reference, reading planner
 * pressure instead of machine telemetry. The waveform is the same CPU-trace
 * drawing, plotted over the fourteen-day creation series.
 */
export function DeskStatus({ stats, mobileOpen }: { stats: DashboardStats; mobileOpen: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB"));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const series = stats.velocity;
    if (!series.length) return;
    const peak = Math.max(1, ...series.map((day) => day.created + day.comments));
    const step = width / Math.max(series.length - 1, 1);

    context.beginPath();
    series.forEach((day, index) => {
      const x = index * step;
      const y = height - ((day.created + day.comments) / peak) * (height - 8) - 4;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = "rgb(255, 194, 28)";
    context.lineWidth = 1.5;
    context.stroke();

    context.lineTo(width, height);
    context.lineTo(0, height);
    context.closePath();
    context.fillStyle = "rgba(255, 194, 28, 0.12)";
    context.fill();
  }, [stats]);

  const { totals } = stats;
  const dot = totals.blocked ? "late" : totals.unassigned || totals.stale ? "risk" : "clear";
  const completion = totals.tasks ? Math.round((totals.done / totals.tasks) * 100) : 0;

  return (
    <section
      className={`desk-panel desk-status${mobileOpen ? " mobile-open" : ""}`}
      aria-label="Planner status"
    >
      <div className="desk-panel-title">
        <span>Planner status</span>
        <span className={`desk-dot ${dot}`}>●</span>
        <span className="desk-clock">{clock}</span>
      </div>

      <div className="desk-columns">
        <div className="desk-col">
          <div className="desk-waveform">
            <canvas ref={canvasRef} />
          </div>
          <div className="desk-readouts">
            <Row label="Created today" value={totals.createdToday} />
            <Row label="Comments today" value={totals.commentsToday} />
            <Row label="Open" value={totals.open} />
            <Row label="Blocked" value={totals.blocked} tone={tone(totals.blocked)} />
          </div>
        </div>

        <div className="desk-col desk-col-right">
          <div className="desk-divider" />
          <div className="desk-section-label">── delivery ──</div>
          <div className="desk-bar">
            <i style={{ width: `${completion}%` }} />
            <b>{completion}%</b>
          </div>
          <div className="desk-readouts">
            <Row label="Awaiting review" value={totals.review} tone={tone(totals.review)} />
            <Row label="Unassigned" value={totals.unassigned} tone={tone(totals.unassigned)} />
            <Row label="Gone quiet" value={totals.stale} tone={tone(totals.stale)} />
            <Row label="Done this week" value={totals.doneThisWeek} tone="good" />
          </div>
        </div>
      </div>
    </section>
  );
}

function tone(value: number) {
  return value ? (value > 3 ? "bad" : "warn") : "good";
}

function Row({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="desk-row">
      <span className="desk-row-label">{label}:</span>
      <span className={`desk-row-value${tone ? ` ${tone}` : ""}`}>{value}</span>
    </div>
  );
}
