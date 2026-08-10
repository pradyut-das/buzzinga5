import { AgentNote, SectionHead, WorkspaceHeader } from "@/components/sq/workspace";
import { getAgencyHealth } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const health = await getAgencyHealth();
  const peak = Math.max(1, ...health.velocity.map((day) => day.created + day.comments));

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Agency / Delivery health" action="Ask Squirrl to explain the score" />

      <div className="sq-workspace-grid two">
        <section style={{ display: "grid", gap: 12, minHeight: 0, overflow: "auto" }}>
          <div className="sq-panel sq-health-score">
            <div className="sq-score-ring" style={{ ["--score" as string]: `${health.score}%` }}>
              <b>{health.score}</b>
              <span>
                {health.label} · {health.delta > 0 ? "+" : ""}
                {health.delta}
              </span>
            </div>
            <div>
              <div className="sq-eyebrow">Delivery health drivers</div>
              <h2 style={{ margin: "5px 0" }}>
                {health.drivers[1].value < 70
                  ? "Good throughput, rising review pressure"
                  : "Steady across the roster"}
              </h2>
              {health.drivers.map((driver) => (
                <div key={driver.name} className="sq-driver">
                  <span>{driver.name}</span>
                  <i style={{ ["--w" as string]: `${driver.value}%` }} />
                  <b>{driver.value}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="sq-kpis">
            {health.kpis.map((kpi) => (
              <div key={kpi.label} className="sq-panel sq-kpi">
                <b>{kpi.value}</b>
                <span>{kpi.label}</span>
              </div>
            ))}
          </div>

          <div className="sq-panel sq-section">
            <div className="sq-eyebrow">Production vs completion · 14 days</div>
            <div className="sq-chart">
              <div className="sq-bars">
                {health.velocity.map((day) => (
                  <i
                    key={day.date}
                    title={`${day.date}: ${day.created} created, ${day.comments} comments`}
                    style={{
                      ["--h" as string]: `${Math.round(((day.created + day.comments) / peak) * 100)}%`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <aside className="sq-panel sq-section">
          <AgentNote>
            Ask why health changed, who is overloaded, what will miss SLA, or tell Squirrl to
            reassign and reprioritise.
          </AgentNote>
          <SectionHead eyebrow="Attention" title="Needs intervention" />
          {health.interventions.map((item) => (
            <div key={`${item.client}-${item.detail}`} className="sq-queue-item">
              <b>
                {item.client} <span className="sq-tag">{item.severity}</span>
              </b>
              <p>{item.detail}</p>
            </div>
          ))}
          {!health.interventions.length && <p className="sq-sub">Nothing needs you right now.</p>}

          <div className="sq-metric" style={{ marginTop: 15 }}>
            <b>{health.postsThisWeek}</b>
            <span>Posts scheduled this week</span>
          </div>
          <div className="sq-metric" style={{ marginTop: 8 }}>
            <b>{health.overdueCaptions}</b>
            <span>Open work with no owner</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
