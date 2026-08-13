import { formatDistanceToNow } from "date-fns";
import {
  NotificationsView,
  type NotificationItem,
} from "@/components/reference/notifications-view";
import { PageHeader } from "@/components/reference/page-header";
import { listNotifications } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const rows = await listNotifications();
  const notifications: NotificationItem[] = rows.map((row) => ({
    id: row.id,
    boardId: row.boardId,
    type: row.type,
    message: row.message,
    context: row.context,
    timestamp: row.createdAt ? formatDistanceToNow(row.createdAt, { addSuffix: true }) : "Just now",
  }));
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader title="Notifications" description="Updates across tasks and clients." />
      <NotificationsView notifications={notifications} />
    </div>
  );
}
