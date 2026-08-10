import { ApprovalRow } from "@/components/sq/approval-row";
import { AgentNote, SectionHead, WorkspaceHeader, EmptyState } from "@/components/sq/workspace";
import { listApprovals } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const [pending, decided] = await Promise.all([
    listApprovals("pending"),
    listApprovals("changes_requested"),
  ]);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Approvals / All clients" action="Ask Squirrl to triage" />

      <div className="sq-workspace-grid sq-approval-flow">
        <section className="sq-panel sq-section">
          <SectionHead
            eyebrow="Waiting on you"
            title={pending.length ? `Decision 1 of ${pending.length}` : "You’re clear"}
          />
          <AgentNote>
            Summarise changes, check brand voice, or draft a change request. Writes are confirmed
            first.
          </AgentNote>

          <div className="sq-approval-focus">
            {pending[0] && <ApprovalRow approval={pending[0]} />}
            {!pending.length && (
              <EmptyState title="You’re clear" hint="Nothing is waiting on your decision." />
            )}
          </div>

          {pending.length > 1 && (
            <details className="sq-collapsed-queue">
              <summary>View the next {pending.length - 1} decisions</summary>
              {pending.slice(1).map((approval) => (
                <ApprovalRow key={approval.id} approval={approval} />
              ))}
            </details>
          )}

          <details className="sq-collapsed-queue">
            <summary>Changes requested · {decided.length}</summary>
            {decided.map((approval) => (
              <ApprovalRow key={approval.id} approval={approval} />
            ))}
            {!decided.length && <p className="sq-sub">Nothing has been sent back this week.</p>}
          </details>
        </section>
      </div>
    </main>
  );
}
