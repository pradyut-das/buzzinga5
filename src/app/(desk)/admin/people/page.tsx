import { notFound } from "next/navigation";
import { AdminContributorsPanel } from "@/components/sq/admin-contributors";
import { AdminNav } from "@/components/sq/admin-nav";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { listAdminContributors } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/** The people named on boards, and whether mail actually reaches them. */
export default async function AdminPeoplePage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const contributors = await listAdminContributors();

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="People" />
      <div className="sq-admin">
        <AdminNav current="/admin/people" />
        <AdminContributorsPanel contributors={contributors} />
      </div>
    </main>
  );
}
