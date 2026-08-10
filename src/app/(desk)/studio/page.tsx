import { CaptionStudio } from "@/components/sq/caption-studio";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { listApprovals, listCaptionDrafts, listClients } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const [drafts, clients, approvals] = await Promise.all([
    listCaptionDrafts(),
    listClients(),
    listApprovals("pending"),
  ]);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Create / Caption studio" action="Generate new variants" />
      <CaptionStudio
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        sources={approvals.slice(0, 12).map((approval) => ({
          assetId: approval.assetId,
          title: approval.title,
          clientId: approval.clientId,
          clientName: approval.clientName,
          accent: approval.accent,
          kind: approval.kind,
        }))}
        drafts={drafts.map(({ draft, client, asset }) => ({
          id: draft.id,
          clientName: client.name,
          assetTitle: asset?.title ?? "Unlinked",
          goal: draft.goal,
          voice: draft.voice,
          variants: JSON.parse(draft.variants) as {
            label: string;
            body: string;
            brandVoicePct: number;
          }[],
          selectedIndex: draft.selectedIndex ?? 0,
          finalBody: draft.finalBody,
          checks: draft.checks ? (JSON.parse(draft.checks) as Record<string, boolean>) : null,
          attached: Boolean(draft.attachedAt),
        }))}
      />
    </main>
  );
}
