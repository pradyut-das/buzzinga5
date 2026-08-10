import { AgentNote, SectionHead, WorkspaceHeader, EmptyState } from "@/components/sq/workspace";
import { SyncButton } from "@/components/sq/sync-button";
import { listCommunities } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

const timeAgo = (date: Date | null) => {
  if (!date) return "never";
  const hours = Math.round((Date.now() - date.getTime()) / 3600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
};

export default async function CommunitiesPage() {
  const { rows, nextBroadcast, sync } = await listCommunities();
  const needingReply = rows.filter((row) => row.community.needsReply > 0).length;

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Communities / WhatsApp" action="Ask Squirrl about communities" />

      <div className="sq-workspace-grid two">
        <section className="sq-panel sq-section">
          <SectionHead
            eyebrow="Community pulse"
            title={`${rows.length} groups · ${needingReply} need a reply`}
            aside={<SyncButton provider="whatsapp" />}
          />

          <AgentNote>
            Squirrl can summarise unread threads, draft a broadcast, flag urgent client questions,
            or schedule an approved message. It confirms before anything sends.
          </AgentNote>

          {sync?.status === "not_configured" && (
            <p className="sq-sub" style={{ marginTop: 10 }}>
              Not connected yet — set <code>WHATSAPP_API_URL</code> to pull live group data. The
              rows below are whatever was last stored.
            </p>
          )}

          {rows.length ? (
            <table className="sq-table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Community</th>
                  <th>Client</th>
                  <th>Members</th>
                  <th>Needs reply</th>
                  <th>Last broadcast</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ community, client }) => (
                  <tr key={community.id}>
                    <td>
                      <b>{community.name}</b>
                    </td>
                    <td>{client?.name ?? "—"}</td>
                    <td>{community.memberCount.toLocaleString()}</td>
                    <td className={community.needsReply ? "sq-needs" : ""}>
                      {community.needsReply}
                    </td>
                    <td>{timeAgo(community.lastBroadcastAt)}</td>
                    <td className={`sq-trend${community.trendPct < 0 ? " down" : ""}`}>
                      {community.trendPct > 0 ? "↑" : community.trendPct < 0 ? "↓" : "→"}{" "}
                      {Math.abs(community.trendPct)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState
              title="No communities yet"
              hint="Connect the WhatsApp provider, or add a group manually."
            />
          )}
        </section>

        <aside className="sq-panel sq-section">
          <div className="sq-eyebrow">Next broadcast</div>
          {nextBroadcast ? (
            <>
              <h2 style={{ margin: "5px 0 15px" }}>{nextBroadcast.community.name}</h2>
              <div className="sq-metric">
                <b>
                  {nextBroadcast.broadcast.scheduledAt?.toLocaleString("en-GB", {
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }) ?? "Unscheduled"}
                </b>
                <span>{nextBroadcast.broadcast.scheduledBy ?? "Squirrl"}</span>
              </div>
              <div className="sq-field">
                <label>Preview</label>
                <div className="sq-fieldbox">{nextBroadcast.broadcast.body}</div>
              </div>
              <div className="sq-field">
                <label>Audience</label>
                <div className="sq-fieldbox">
                  {nextBroadcast.broadcast.audience} ·{" "}
                  {nextBroadcast.community.memberCount.toLocaleString()} recipients
                </div>
              </div>
            </>
          ) : (
            <p className="sq-sub">Nothing scheduled. Ask Squirrl to draft one.</p>
          )}

          <div className="sq-queue-item" style={{ marginTop: 16 }}>
            <b>Reply SLA</b>
            <p>
              {needingReply
                ? `${needingReply} group${needingReply === 1 ? "" : "s"} waiting on a reply.`
                : "Every group is answered."}
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
