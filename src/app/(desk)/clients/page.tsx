import { ClientCardsHome } from "@/components/sq/client-cards-home";
import { listClients } from "@/lib/agency/queries";
import { getCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, admin] = await Promise.all([listClients(), getCurrentAdmin()]);
  return <ClientCardsHome clients={clients} canCreate={Boolean(admin)} />;
}
