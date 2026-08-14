import { redirect } from "next/navigation";
import { ClientRail } from "@/components/sq/client-rail";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * The Squirrl Agency OS shell, matching the reference application. Client
 * data powers search and pages, but never appears as a second sidebar list.
 */
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <ClientRail>{children}</ClientRail>;
}
