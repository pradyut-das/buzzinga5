import { notFound } from "next/navigation";
import { AdminEmailPanel } from "@/components/sq/admin-email";
import { AdminNav } from "@/components/sq/admin-nav";
import { WorkspaceHeader } from "@/components/sq/workspace";
import { getCurrentAdmin } from "@/lib/auth/admin";
import { listAdminPendingNotifications, listAdminSentEmails } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/** The notification queue and the delivery log behind it. */
export default async function AdminEmailPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const [queued, sent] = await Promise.all([
    listAdminPendingNotifications(),
    listAdminSentEmails(),
  ]);

  return (
    <main className="sq-main">
      <WorkspaceHeader crumb="Email" />
      <div className="sq-admin">
        <AdminNav current="/admin/email" />
        <AdminEmailPanel queued={queued} sent={sent} />
      </div>
    </main>
  );
}
