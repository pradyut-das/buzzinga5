import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { BoardSidebar } from "@/components/sidebar/board-sidebar";
import { getCurrentUser } from "@/lib/auth/session";

// The sidebar reads the session cookie, so this layout is per-request.
export const dynamic = "force-dynamic";

interface BoardsLayoutProps {
  children: ReactNode;
}

export default async function BoardsLayout({ children }: BoardsLayoutProps) {
  // Boards are only reachable while signed in. Middleware already redirects
  // requests without a session cookie; this catches invalid/expired sessions.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="relative flex h-screen overflow-hidden">
      <BoardSidebar />
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
