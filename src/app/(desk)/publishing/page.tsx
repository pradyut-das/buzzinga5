import { PublishingQueue } from "@/components/sq/publishing-queue";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { listScheduledPosts } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function PublishingPage() {
  const posts = await listScheduledPosts();

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Publishing / Queue" action="Ask Squirrl what is blocked" />
      <PublishingQueue
        posts={posts.map(({ post, client }) => ({
          id: post.id,
          title: post.title,
          clientName: client.name,
          clientColor: client.color,
          platform: post.platform,
          state: post.state,
          scheduledAt: post.scheduledAt.toISOString(),
        }))}
      />
    </main>
  );
}
