import { ClientCardsHome } from "@/components/sq/client-cards-home";
import { HomeDesk } from "@/components/sq/home-desk";
import { geminiConfigured } from "@/lib/agent/gemini";
import { isAdminEmail } from "@/lib/auth/admin";
import { getAgencyHealth, listApprovals, listClients } from "@/lib/agency/queries";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function DeskHome() {
  const user = await getCurrentUser();

  // Voice agent is admin-only; everyone else's desk is the client roster.
  if (!isAdminEmail(user?.email)) {
    const clients = await listClients();
    return <ClientCardsHome clients={clients} />;
  }

  const [approvals, health] = await Promise.all([listApprovals("pending"), getAgencyHealth()]);

  return (
    <HomeDesk
      approvals={approvals}
      agentEnabled={geminiConfigured()}
      headline={`${health.label} · delivery health ${health.score}`}
    />
  );
}
