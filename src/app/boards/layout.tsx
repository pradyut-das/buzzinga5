import { redirect } from "next/navigation";
import { ClientRail } from "@/components/sq/client-rail";
import { listClients } from "@/lib/agency/queries";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function BoardsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <ClientRail clients={await listClients()}>{children}</ClientRail>;
}
