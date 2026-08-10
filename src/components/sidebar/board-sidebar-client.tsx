"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, PanelLeftClose, PanelLeftOpen, Plus, SquareKanban } from "lucide-react";
import { signOut } from "@/actions/auth";
import type { SessionUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { CreateBoardDialog } from "@/components/create-board-dialog";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "itacorubi:sidebar-collapsed";

export interface SidebarBoard {
  id: string;
  title: string;
}

interface BoardSidebarClientProps {
  user: SessionUser;
  boards: SidebarBoard[];
}

export function BoardSidebarClient({ user, boards }: BoardSidebarClientProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true");
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      localStorage.setItem(COLLAPSED_KEY, String(!prev));
      return !prev;
    });
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace("/");
    router.refresh();
  };

  return (
    <aside
      data-testid="board-sidebar"
      data-collapsed={isCollapsed}
      className={cn(
        "hidden md:flex h-screen shrink-0 flex-col border-r glass glass-strong rounded-none transition-[width]",
        isCollapsed ? "w-14" : "w-64",
      )}
    >
      <div className="flex items-center gap-2 px-2 py-3">
        {!isCollapsed && (
          <Link href="/" className="px-2 text-heading-sm truncate">
            Squirrl
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {!isCollapsed && (
          <span className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Boards
          </span>
        )}

        {boards.length === 0 && !isCollapsed && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No boards yet.</p>
        )}

        {boards.map((board) => (
          <SidebarLink
            key={board.id}
            href={`/boards/${board.id}`}
            icon={<SquareKanban className="h-4 w-4 shrink-0" />}
            label={board.title}
            title={board.title}
            isActive={pathname.startsWith(`/boards/${board.id}`)}
            isCollapsed={isCollapsed}
          />
        ))}
      </nav>

      <div className="border-t border-border/50 p-2">
        <Button
          variant="ghost"
          className={cn("w-full gap-2", isCollapsed ? "justify-center px-0" : "justify-start")}
          onClick={() => setIsCreateOpen(true)}
          title="Create a board"
          aria-label="Create a board"
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>New board</span>}
        </Button>

        <div className={cn("mt-2", isCollapsed && "flex justify-center")}>
          {!isCollapsed && (
            <p className="truncate px-3 text-xs text-muted-foreground" title={user.email}>
              {user.name}
            </p>
          )}
          <Button
            variant="ghost"
            className={cn("w-full gap-2", isCollapsed ? "justify-center px-0" : "justify-start")}
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Sign out</span>}
          </Button>
        </div>
      </div>

      <CreateBoardDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </aside>
  );
}

interface SidebarLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  title: string;
  isActive: boolean;
  isCollapsed: boolean;
  testId?: string;
}

function SidebarLink({
  href,
  icon,
  label,
  title,
  isActive,
  isCollapsed,
  testId,
}: SidebarLinkProps) {
  return (
    <Link
      href={href}
      title={title}
      data-testid={testId}
      data-active={isActive}
      className={cn(
        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
        isCollapsed && "justify-center px-0",
        isActive
          ? "bg-white/60 text-foreground dark:bg-white/10"
          : "text-muted-foreground hover:bg-white/40 hover:text-foreground dark:hover:bg-white/5",
      )}
    >
      {icon}
      {!isCollapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
