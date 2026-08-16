import { notFound } from "next/navigation";
import { AdminDeliveryPanel } from "@/components/sq/admin-delivery";
import { AdminNav } from "@/components/sq/admin-nav";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { listAdminApprovals, listAdminScheduledPosts } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/** Approvals and the publishing queue — what is stuck on its way out. */
export default async function AdminDeliveryPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const [approvals, posts] = await Promise.all([listAdminApprovals(), listAdminScheduledPosts()]);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Delivery" />
      <div className="sq-admin">
        <AdminNav current="/admin/delivery" />
        <AdminDeliveryPanel approvals={approvals} posts={posts} />
      </div>
    </main>
  );
}
