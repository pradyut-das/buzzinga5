import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/sq/admin-nav";
import { AiUsagePanel } from "@/components/sq/ai-usage-panel";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { getAiUsageReport } from "@/lib/ai/report";
import { getCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * AI spend and audit trail. Admins only, and a 404 for everyone else so the
 * page's existence is not advertised — the same rule the rest of the console
 * follows.
 */
export default async function AiUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const { days } = await searchParams;
  const parsed = Number(days);
  const window = Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? Math.floor(parsed) : 30;

  const report = await getAiUsageReport(window);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="AI usage" />
      <div className="sq-admin">
        <AdminNav current="/admin/ai" />

        <nav className="sq-admin-tabs">
          {[7, 30, 90].map((option) => (
            <Link
              key={option}
              className={`sq-pill${option === window ? " amber" : ""}`}
              href={`/admin/ai?days=${option}`}
            >
              {option} days
            </Link>
          ))}
          {/* An API route rather than a page, but Link navigates to it just as
              well and keeps the rule that catches real mistakes switched on. */}
          <Link className="sq-pill" href={`/api/admin/ai-usage?days=${window}`}>
            JSON
          </Link>
        </nav>
      </div>
      <AiUsagePanel report={report} />
    </main>
  );
}
