import { CaptionStudio } from "@/components/sq/caption-studio";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { listCaptionDrafts, listClients, listStudioAssets } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const [drafts, clients, assets] = await Promise.all([
    listCaptionDrafts(),
    listClients(),
    listStudioAssets(),
  ]);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Create / Caption studio" action="Generate new variants" />
      <CaptionStudio
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        sources={assets.slice(0, 12).map(({ asset, client }) => ({
          assetId: asset.id,
          title: asset.title,
          clientId: client.id,
          clientName: client.name,
          accent: asset.accent,
          kind: asset.kind,
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
