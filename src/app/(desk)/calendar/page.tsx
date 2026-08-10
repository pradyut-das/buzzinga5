import Link from "next/link";
import { AgentNote, SectionHead, WorkspaceHeader } from "@/components/sq/workspace";
import { listScheduledPosts } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export default async function CalendarPage() {
  const posts = await listScheduledPosts();

  // The week starts on Monday, which is how the agency plans.
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday.getTime() + index * DAY_MS);
    const next = new Date(day.getTime() + DAY_MS);
    return {
      day,
      events: posts.filter(({ post }) => post.scheduledAt >= day && post.scheduledAt < next),
    };
  });

  const collisions = days.filter((day) => day.events.length > 2).length;

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Calendar / All clients" action="Ask Squirrl to rebalance this week" />

      <div className="sq-workspace-grid">
        <section className="sq-panel sq-section">
          <SectionHead
            eyebrow="Cross-client calendar"
            title={`${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${new Date(
              monday.getTime() + 6 * DAY_MS,
            ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
            aside={<span className="sq-pill">{posts.length} scheduled</span>}
          />

          <AgentNote>
            Squirrl can find collisions, fill calendar gaps, reschedule approved work, or show what
            is blocked from publishing.
            {collisions > 0 &&
              ` ${collisions} day${collisions === 1 ? "" : "s"} this week ${collisions === 1 ? "is" : "are"} carrying three or more posts.`}
          </AgentNote>

          <div className="sq-calendar" style={{ marginTop: 14 }}>
            {days.map(({ day, events }) => (
              <div key={day.toISOString()} className="sq-day">
                <b>
                  {day.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()}{" "}
                  {String(day.getDate()).padStart(2, "0")}
                </b>
                {events.map(({ post, client }) => (
                  <Link
                    key={post.id}
                    href={`/clients/${client.id}`}
                    className="sq-event"
                    style={{ ["--ev" as string]: client.color, display: "block" }}
                  >
                    {client.name} · {post.platform}
                    <br />
                    {post.scheduledAt.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {post.state}
                  </Link>
                ))}
                {!events.length && <p className="sq-sub">—</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
