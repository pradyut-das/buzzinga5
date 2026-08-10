"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Gauge,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PenLine,
  Radar,
  Send,
  Settings2,
  X,
  type LucideIcon,
} from "lucide-react";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SquirrlMark } from "@/components/sq/mascot";
import { SqThemeToggle } from "@/components/sq/theme-toggle";
import type { ClientSummary } from "@/lib/agency/queries";

const RAIL_OPEN_KEY = "squirrl:rail-open";

const PRIMARY_WORKSPACES: Array<{
  href: string;
  label: string;
  Icon: LucideIcon;
}> = [
  { href: "/approvals", label: "All approvals", Icon: CheckCircle2 },
  { href: "/calendar", label: "Content calendar", Icon: CalendarDays },
];

const MORE_WORKSPACES: Array<{
  href: string;
  label: string;
  Icon: LucideIcon;
}> = [
  { href: "/communities", label: "Communities", Icon: MessageCircle },
  { href: "/radar", label: "Topic radar", Icon: Radar },
  { href: "/studio", label: "Caption studio", Icon: PenLine },
  { href: "/publishing", label: "Publishing", Icon: Send },
  { href: "/health", label: "Agency health", Icon: Activity },
];

/**
 * The rail is the one stable surface: a client is a board, so this list is
 * both the client roster and the board switcher. It survives every workspace,
 * including the full-screen board.
 */
export function ClientRail({
  clients,
  isAdmin = false,
}: {
  clients: ClientSummary[];
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(localStorage.getItem(RAIL_OPEN_KEY) === "true");
  }, []);

  const toggleOpen = () =>
    setIsOpen((prev) => {
      localStorage.setItem(RAIL_OPEN_KEY, String(!prev));
      return !prev;
    });

  const clientLink = (client: ClientSummary) => {
    const href = `/clients/${client.id}`;
    return (
      <Link
        key={client.id}
        href={href}
        className={`sq-client${pathname === href ? " active" : ""}`}
        title={`${client.name} · ${client.openTasks} open`}
      >
        <span className="sq-avatar" style={{ ["--av" as string]: client.color }}>
          {client.initials}
        </span>
        <span>
          <strong>{client.name}</strong>
          <span className="sq-meta">
            <i
              className={`sq-dot${client.health === "risk" ? " bad" : client.health === "watch" ? " warn" : ""}`}
            />
            {client.openTasks} open
          </span>
        </span>
        {client.pendingApprovals > 0 && <span className="sq-count">{client.pendingApprovals}</span>}
      </Link>
    );
  };

  return (
    <nav className="sq-rail" data-open={isOpen} aria-label="Clients and workspaces">
      <div className="sq-brand-row">
        <button
          type="button"
          className="sq-hamburger"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse client list" : "Expand client list"}
        >
          {isOpen ? <X aria-hidden /> : <Menu aria-hidden />}
        </button>
        <Link href="/" className="sq-brand" aria-label="Squirrl home">
          <span className="sq-brandmark">
            <SquirrlMark />
          </span>
          <span>Squirrl</span>
        </Link>
      </div>

      <div className="sq-workspace-label">Client boards</div>
      <div className="sq-clients">
        {clients.map(clientLink)}
        {!clients.length && <p className="sq-empty">No clients yet</p>}
      </div>

      <div className="sq-rail-links">
        {PRIMARY_WORKSPACES.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={`sq-rail-link${pathname.startsWith(href) ? " active" : ""}`}
          >
            <Icon aria-hidden />
            <span className="sq-nav-label">{label}</span>
          </Link>
        ))}
        <details className="sq-more-nav">
          <summary aria-label="More tools">
            <MoreHorizontal aria-hidden />
            <span className="sq-nav-label">More tools</span>
          </summary>
          <div>
            {MORE_WORKSPACES.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={`sq-rail-link${pathname.startsWith(href) ? " active" : ""}`}
              >
                <Icon aria-hidden />
                <span className="sq-nav-label">{label}</span>
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                aria-label="Admin"
                className={`sq-rail-link${pathname.startsWith("/admin") ? " active" : ""}`}
              >
                <Settings2 aria-hidden />
                <span className="sq-nav-label">Admin</span>
              </Link>
            )}
          </div>
        </details>
        <div className="sq-rail-foot">
          <SqThemeToggle />
          <SignOutButton />
        </div>
      </div>

      <div className="sq-mobile-nav" role="group" aria-label="Mobile workspaces">
        <Link href="/" className={pathname === "/" ? "active" : ""}>
          <LayoutDashboard aria-hidden />
          <span>Desk</span>
        </Link>
        <Link href="/approvals" className={pathname.startsWith("/approvals") ? "active" : ""}>
          <CheckCircle2 aria-hidden />
          <span>Approvals</span>
        </Link>
        <Link href="/calendar" className={pathname.startsWith("/calendar") ? "active" : ""}>
          <CalendarDays aria-hidden />
          <span>Calendar</span>
        </Link>
        <Link href="/health" className={pathname.startsWith("/health") ? "active" : ""}>
          <Gauge aria-hidden />
          <span>Health</span>
        </Link>
      </div>
    </nav>
  );
}
