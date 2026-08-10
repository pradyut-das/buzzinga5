import { TopicRadar } from "@/components/sq/topic-radar";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { listTopics } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const { rows, sync } = await listTopics();

  return (
    <main className="sq-main">
      <WorkspaceHeader
        crumb="Research / Topic radar"
        action="Ask Squirrl to turn a topic into work"
      />
      <TopicRadar
        topics={rows.map(({ topic, client }) => ({
          id: topic.id,
          title: topic.title,
          evidence: topic.evidence,
          momentumPct: topic.momentumPct,
          novelty: topic.novelty,
          state: topic.state,
          clientName: client?.name ?? "Unassigned",
          radarX: topic.radarX ?? 50,
          radarY: topic.radarY ?? 50,
        }))}
        syncStatus={sync?.status ?? "never"}
      />
    </main>
  );
}
