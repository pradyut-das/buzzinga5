"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardStats } from "@/lib/agent/stats";

const RANGES = [7, 14] as const;

/**
 * The reference's spectrum analyzer, re-pointed at planner throughput: tasks
 * created and comments posted per day, drawn as stacked bars with the same
 * header trace and range switcher.
 */
export function DeskAnalyzer({
  stats,
  mobileOpen,
}: {
  stats: DashboardStats;
  mobileOpen: boolean;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [collapsed, setCollapsed] = useState(false);
  const chartRef = useRef<HTMLCanvasElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);

  const series = stats.velocity.slice(-range);

  useEffect(() => {
    const canvas = chartRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || collapsed) return;

    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const peak = Math.max(1, ...series.map((day) => day.created + day.comments));
    const slot = width / Math.max(series.length, 1);
    const barWidth = Math.max(3, slot * 0.55);

    series.forEach((day, index) => {
      const x = index * slot + (slot - barWidth) / 2;
      const createdHeight = (day.created / peak) * (height - 18);
      const commentHeight = (day.comments / peak) * (height - 18);

      context.fillStyle = "rgba(255, 194, 28, 0.85)";
      context.fillRect(x, height - 14 - createdHeight, barWidth, createdHeight);
      context.fillStyle = "rgba(74, 222, 128, 0.55)";
      context.fillRect(x, height - 14 - createdHeight - commentHeight, barWidth, commentHeight);

      if (series.length <= 14 || index % 2 === 0) {
        context.fillStyle = "rgba(194, 184, 178, 0.75)";
        context.font = "9px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText(day.date.slice(8), x + barWidth / 2, height - 3);
      }
    });

    context.strokeStyle = "rgba(255, 194, 28, 0.18)";
    context.beginPath();
    context.moveTo(0, height - 14);
    context.lineTo(width, height - 14);
    context.stroke();
  }, [series, collapsed]);

  useEffect(() => {
    const canvas = traceRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = 120 * ratio;
    canvas.height = 24 * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, 120, 24);

    const peak = Math.max(1, ...stats.velocity.map((day) => day.created));
    const step = 120 / Math.max(stats.velocity.length - 1, 1);
    context.beginPath();
    stats.velocity.forEach((day, index) => {
      const y = 22 - (day.created / peak) * 20;
      if (index === 0) context.moveTo(index * step, y);
      else context.lineTo(index * step, y);
    });
    context.strokeStyle = "rgba(255, 194, 28, 0.8)";
    context.lineWidth = 1.2;
    context.stroke();
  }, [stats.velocity]);

  const created = series.reduce((sum, day) => sum + day.created, 0);
  const commented = series.reduce((sum, day) => sum + day.comments, 0);

  return (
    <section
      className={`desk-analyzer${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
      aria-label="Throughput"
    >
      <div className="desk-analyzer-head">
        <span>▤ Throughput</span>
        <canvas ref={traceRef} aria-hidden />
        <button
          type="button"
          className="desk-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand throughput" : "Collapse throughput"}
        >
          {collapsed ? "▲" : "▼"}
        </button>
      </div>

      <div className="desk-analyzer-body">
        <canvas ref={chartRef} className="desk-analyzer-canvas" />
        <div className="desk-analyzer-foot">
          <div className="desk-range">
            <span className="desk-range-label">Range:</span>
            {RANGES.map((value) => (
              <button
                key={value}
                type="button"
                className="desk-range-btn"
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {value} days
              </button>
            ))}
          </div>
          <div className="desk-legend">
            <span>
              <i style={{ background: "rgba(255, 194, 28, 0.85)" }} />
              {created} tasks created
            </span>
            <span>
              <i style={{ background: "rgba(74, 222, 128, 0.55)" }} />
              {commented} comments
            </span>
            <span>
              <i style={{ background: "rgba(194, 184, 178, 0.6)" }} />
              {stats.totals.doneThisWeek} finished this week
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
