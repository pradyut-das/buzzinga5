import type { AdminApproval, AdminScheduledPost } from "@/lib/admin/queries";

/**
 * The production pipeline, read-only.
 *
 * Approvals and publishing are decisions with real consequences outside the
 * app — approving on a client's behalf, or re-firing a post, belongs on the
 * desk where the work and its context are. The console's job here is to show
 * an admin what is stuck and why.
 */

function when(at: Date | null): string {
  if (!at) return "—";
  return new Date(at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function approvalTone(state: string): string {
  if (state === "pending") return "tone-amber";
  if (state === "approved") return "tone-green";
  if (state === "expired") return "tone-red";
  return "";
}

function postTone(state: string): string {
  if (state === "failed") return "tone-red";
  if (state === "published") return "tone-green";
  if (state === "publishing") return "tone-amber";
  return "";
}

export function AdminDeliveryPanel({
  approvals,
  posts,
}: {
  approvals: AdminApproval[];
  posts: AdminScheduledPost[];
}) {
  return (
    <>
      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Approvals</h2>
          <span className="sq-sub">
            {approvals.filter((row) => row.state === "pending").length} pending
          </span>
        </div>
        {approvals.length === 0 ? (
          <p className="sq-sub">Nothing has been sent for approval.</p>
        ) : (
          <table className="sq-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Client</th>
                <th>State</th>
                <th>Reason</th>
                <th>Due</th>
                <th>Raised</th>
              </tr>
            </thead>
            <tbody>
              {approvals.map((row) => (
                <tr key={row.id}>
                  <td>{row.assetTitle}</td>
                  <td>{row.clientName}</td>
                  <td>
                    <span className={`sq-status-chip ${approvalTone(row.state)}`}>{row.state}</span>
                  </td>
                  <td>{row.reason ?? "—"}</td>
                  <td>{when(row.dueAt)}</td>
                  <td>{when(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="sq-panel">
        <div className="sq-section-head">
          <h2>Publishing queue</h2>
          <span className="sq-sub">
            {posts.filter((row) => row.state === "failed").length} failed
          </span>
        </div>
        {posts.length === 0 ? (
          <p className="sq-sub">Nothing scheduled.</p>
        ) : (
          <table className="sq-table">
            <thead>
              <tr>
                <th>Scheduled</th>
                <th>Title</th>
                <th>Client</th>
                <th>Platform</th>
                <th>State</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((row) => (
                <tr key={row.id}>
                  <td>{when(row.scheduledAt)}</td>
                  <td>{row.title}</td>
                  <td>{row.clientName}</td>
                  <td>{row.platform}</td>
                  <td>
                    <span className={`sq-status-chip ${postTone(row.state)}`}>{row.state}</span>
                  </td>
                  <td>{row.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
