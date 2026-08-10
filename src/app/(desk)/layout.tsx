import { redirect } from "next/navigation";
import { ClientRail } from "@/components/sq/client-rail";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdminEmail } from "@/lib/auth/admin";
import { listClients } from "@/lib/agency/queries";
import "@/styles/desk-v2.css";

export const dynamic = "force-dynamic";

/**
 * The desk shell: holographic field, the client rail, and one glass surface
 * for whichever workspace is open. The rail is stable across every screen
 * because a client *is* a board here.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const clients = await listClients();

  return (
    <div className="sq sq-app">
      <ClientRail clients={clients} isAdmin={isAdminEmail(user.email)} />
      {children}
    </div>
  );
}
