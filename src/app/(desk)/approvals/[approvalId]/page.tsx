import { notFound } from "next/navigation";
import { ReviewStage } from "@/components/sq/review-stage";
import { AgentNote, SectionHead, ToolRow, WorkspaceHeader } from "@/components/sq/workspace";
import { getApproval } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ approvalId: string }>;
}) {
  const { approvalId } = await params;
  const record = await getApproval(approvalId);
  if (!record) notFound();

  const { approval, asset, client, notes } = record;
  const agentNote = notes.find((note) => note.source === "agent");

  return (
    <main className="sq-main">
      <WorkspaceHeader
        crumb={`Approvals / ${client.name} / ${asset.title}`}
        action="Ask about this asset"
      />

      <div className="sq-workspace-grid two">
        <ReviewStage
          approvalId={approval.id}
          state={approval.state}
          title={asset.title}
          clientName={client.name}
          kind={asset.kind}
          accent={asset.accent}
          blobUrl={asset.blobUrl}
          slideCount={asset.slideCount}
          durationSeconds={asset.durationSeconds}
          body={asset.body}
        />

        <aside className="sq-panel sq-section">
          <SectionHead
            eyebrow="Review context"
            title={asset.title}
            aside={
              <span className="sq-tag">
                {approval.dueAt
                  ? `Due ${approval.dueAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
                  : `${record.ageLabel} old`}
              </span>
            }
          />

          <AgentNote>
            {agentNote?.body ??
              `Squirrl checked this against ${client.name}’s voice guide and found nothing to flag. It can summarise feedback, draft a change request, or move the task after you decide.`}
          </AgentNote>

          <ToolRow tools={["Summarise feedback", "Check brand voice", "Draft change request"]} />

          <div style={{ marginTop: 16 }}>
            {notes.map((note) => (
              <div key={note.id} className="sq-timeline">
                <time>
                  {note.createdAt?.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <p>
                  <b>{note.author}</b>
                  {note.slideIndex !== null && ` · slide ${note.slideIndex}`}
                  <br />
                  {note.body}
                </p>
              </div>
            ))}
            {!notes.length && (
              <p className="sq-sub">No feedback yet. Pin a comment to a slide to start one.</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
