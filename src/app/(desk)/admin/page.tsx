import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/sq/admin-console";
import { getCurrentAdmin } from "@/lib/auth/admin";
import {
  listAdminBoards,
  listAdminCategories,
  listAdminClients,
  listAdminUsers,
} from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/**
 * Top-level CRUD over users, clients, boards and task categories. Non-admins get a 404 rather
 * than a redirect, so the console's existence is not advertised to them.
 */
export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const [users, clients, boards, categories] = await Promise.all([
    listAdminUsers(),
    listAdminClients(),
    listAdminBoards(),
    listAdminCategories(),
  ]);

  return (
    <AdminConsole
      currentUserId={admin.id}
      users={users}
      clients={clients}
      boards={boards}
      categories={categories}
    />
  );
}
