import { notFound } from "next/navigation";
import { AdminConsole } from "@/components/sq/admin-console";
import { getCurrentAdmin } from "@/lib/auth/admin";
import {
  listAdminBoards,
  listAdminCategories,
  listAdminClients,
  listAdminTags,
  listAdminUsers,
} from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

/** Top-level CRUD over users, clients, boards, categories and tags. */
export default async function AdminWorkspacePage() {
  const admin = await getCurrentAdmin();
  if (!admin) notFound();

  const [users, clients, boards, categories, tags] = await Promise.all([
    listAdminUsers(),
    listAdminClients(),
    listAdminBoards(),
    listAdminCategories(),
    listAdminTags(),
  ]);

  return (
    <AdminConsole
      currentUserId={admin.id}
      users={users}
      clients={clients}
      boards={boards}
      categories={categories}
      tags={tags}
    />
  );
}
