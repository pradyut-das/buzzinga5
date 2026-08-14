import { CreateClientAction } from "@/components/reference/page-create-actions";
import { PageHeader } from "@/components/reference/page-header";
import { ClientCards } from "@/components/sq/client-cards-home";
import { listClients } from "@/lib/agency/queries";
import { getCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const [clients, admin] = await Promise.all([listClients(), getCurrentAdmin()]);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader title="Clients" description="Your active agency accounts.">
        {admin ? <CreateClientAction /> : null}
      </PageHeader>
      <ClientCards clients={clients} />
    </div>
  );
}
