import { notFound } from "next/navigation";
import { AdminNav } from "@/components/sq/admin-nav";
import { AdminOverviewPanel } from "@/components/sq/admin-overview";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { getAdminOverview, listAdminIntegrations } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/**
 * The console's landing page: one screen that says whether anything is stuck.
 * Non-admins get a 404 rather than a redirect, so the console's existence is
 * not advertised to them — the same rule every page under /admin follows.
 */
export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const [overview, integrations] = await Promise.all([getAdminOverview(), listAdminIntegrations()]);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Admin" />
      <div className="sq-admin">
        <AdminNav current="/admin" />
        <AdminOverviewPanel overview={overview} integrations={integrations} />
      </div>
    </main>
  );
}
