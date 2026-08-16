import Link from "next/link";
import { formatUsd } from "@/lib/ai/pricing";
import type { AdminIntegration, AdminOverview } from "@/lib/admin/queries";

/**
 * The console's landing view: what is running, and what is stuck.
 *
 * Every tile is a count an admin would act on, and the ones that mean
 * "something is wrong" carry a tone so a broken cron or a failed publish is
 * visible without reading a table. Tiles link to the tab that fixes them.
 */

type Tone = "" | "tone-amber" | "tone-red" | "tone-green";

function Stat({
  label,
  value,
  hint,
  tone = "",
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: Tone;
  href?: string;
}) {
  const body = (
    <>
      <div className="sq-section-head" style={{ marginBottom: 6 }}>
        <strong className="sq-sub">{label}</strong>
        {tone && <span className={`sq-status-chip ${tone}`}>!</span>}
      </div>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{value}</p>
      {hint && (
        <p className="sq-sub" style={{ marginTop: 4 }}>
          {hint}
        </p>
      )}
    </>
  );

  if (href) {
    return (
      <Link className="sq-metric" href={href} style={{ padding: 16, display: "block" }}>
        {body}
      </Link>
    );
  }
  return (
    <div className="sq-metric" style={{ padding: 16 }}>
      {body}
    </div>
  );
}

/** A sync older than a day is stale enough to mention, not to alarm about. */
function integrationTone(integration: AdminIntegration): Tone {
  if (integration.status === "error") return "tone-red";
  if (integration.status === "never") return "tone-amber";
  if (!integration.lastSyncAt) return "tone-amber";
  const ageMs = Date.now() - new Date(integration.lastSyncAt).getTime();
  return ageMs > 24 * 60 * 60 * 1000 ? "tone-amber" : "tone-green";
}

export function AdminOverviewPanel({
  overview,
  integrations,
}: {
  overview: AdminOverview;
  integrations: AdminIntegration[];
}) {
  return (
    <>
      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Today</h2>
          <span className="sq-sub">Counts reset at midnight UTC</span>
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          <Stat
            label="AI spend"
            value={formatUsd(overview.aiCostMicroUsdToday)}
            hint={`${overview.aiCallsToday} calls`}
            tone={overview.aiErrorsToday > 0 ? "tone-amber" : ""}
            href="/admin/ai"
          />
          <Stat
            label="AI failures"
            value={overview.aiErrorsToday}
            hint="errors and refusals"
            tone={overview.aiErrorsToday > 0 ? "tone-amber" : ""}
            href="/admin/ai"
          />
          <Stat
            label="Email sent"
            value={overview.emailsSentToday}
            hint={`${overview.emailsFailedToday} not delivered`}
            tone={overview.emailsFailedToday > 0 ? "tone-red" : ""}
            href="/admin/email"
          />
          <Stat
            label="Queued notifications"
            value={overview.pendingNotifications}
            hint="waiting for the digest cron"
            tone={overview.pendingNotifications > 200 ? "tone-amber" : ""}
            href="/admin/email"
          />
        </div>
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Needs attention</h2>
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          <Stat
            label="Pending approvals"
            value={overview.pendingApprovals}
            tone={overview.pendingApprovals > 0 ? "tone-amber" : ""}
            href="/admin/delivery"
          />
          <Stat
            label="Failed posts"
            value={overview.failedPosts}
            tone={overview.failedPosts > 0 ? "tone-red" : ""}
            href="/admin/delivery"
          />
          <Stat label="Open review notes" value={overview.openReviewNotes} />
          <Stat
            label="Unsubscribed"
            value={overview.unsubscribed}
            hint={`of ${overview.contributors} people`}
          />
        </div>
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Scale</h2>
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          }}
        >
          <Stat label="Users" value={overview.users} />
          <Stat
            label="Clients"
            value={overview.activeClients}
            hint={`${overview.clients - overview.activeClients} archived`}
          />
          <Stat label="Boards" value={overview.boards} />
          <Stat label="Tasks" value={overview.tasks} hint={`${overview.openTasks} not done`} />
          <Stat label="Assets" value={overview.assets} />
          <Stat label="Scheduled posts" value={overview.scheduledPosts} />
        </div>
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Integrations</h2>
          <span className="sq-sub">Last successful sync per provider</span>
        </div>
        {integrations.length === 0 ? (
          <p className="sq-sub">No provider has ever synced.</p>
        ) : (
          <table className="sq-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Last sync</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((integration) => (
                <tr key={integration.provider}>
                  <td>{integration.provider}</td>
                  <td>
                    <span className={`sq-status-chip ${integrationTone(integration)}`}>
                      {integration.status}
                    </span>
                  </td>
                  <td>
                    {integration.lastSyncAt
                      ? new Date(integration.lastSyncAt).toLocaleString()
                      : "never"}
                  </td>
                  <td>{integration.detail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
