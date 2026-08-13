import { format, isToday } from "date-fns";
import { VoicePlanner, type PlannerEvent } from "@/components/reference/voice-planner";
import { geminiConfigured } from "@/lib/agent/gemini";
import { listScheduledPosts } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function DeskHome() {
  const posts = await listScheduledPosts();
  const events: PlannerEvent[] = posts
    .filter(({ post }) => isToday(post.scheduledAt))
    .slice(0, 3)
    .map(({ post, client }) => ({
      id: post.id,
      clientId: client.id,
      clientName: client.name,
      clientColor: client.color,
      title: `${post.platform} · ${post.state}`,
      at: format(post.scheduledAt, "h:mm a"),
    }));

  return (
    <div className="mx-auto max-w-[1500px]">
      <VoicePlanner agentEnabled={geminiConfigured()} events={events} />
    </div>
  );
}
