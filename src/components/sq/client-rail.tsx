"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  CircleHelp,
  Home,
  Menu,
  Search,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ClientSummary } from "@/lib/agency/queries";

const NAV: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/clients", label: "Clients", Icon: Users },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/notifications", label: "Notifications", Icon: Bell },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-3 py-2" aria-label="Squirrl home">
      <span className="relative h-8 w-8" aria-hidden>
        <span className="absolute left-1 top-2 h-5 w-2 rotate-[28deg] rounded-full bg-[#2b6ff5]" />
        <span className="absolute right-1 top-1 h-6 w-2 -rotate-[28deg] rounded-full bg-[#42c5e9]" />
        <span className="absolute bottom-1 left-[11px] h-2 w-3 rounded-full bg-[#5b7cf7]" />
      </span>
      <span className="text-[22px] font-semibold tracking-[-0.03em] text-ink">Squirrl</span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/clients") return pathname.startsWith("/clients") || pathname.startsWith("/boards");
  return pathname.startsWith(href);
}

function Navigation({ pathname, close }: { pathname: string; close?: () => void }) {
  return (
    <nav className="mt-8 space-y-2" aria-label="Primary navigation">
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            onClick={close}
            className={`flex items-center gap-4 rounded-[13px] px-4 py-3.5 text-[15px] font-medium transition-colors ${
              active ? "bg-[#fff3cc] text-[#8a6100]" : "text-[#475467] hover:bg-slate-50"
            }`}
          >
            <Icon
              className={`h-5 w-5 ${active ? "text-accent-foreground" : "text-[#667085]"}`}
              strokeWidth={1.9}
              aria-hidden
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function CommandPalette({
  open,
  setOpen,
  clients,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  clients: ClientSummary[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    return clients
      .filter((client) => !value || client.name.toLowerCase().includes(value))
      .slice(0, 8);
  }, [clients, query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/20 px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={() => setOpen(false)}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="w-full max-w-xl overflow-hidden rounded-[18px] border border-line bg-white shadow-modal"
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.18 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <Search className="h-5 w-5 text-slate-400" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search clients…"
                className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
              />
              <kbd className="rounded-md border border-line bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                ESC
              </kbd>
            </div>
            <div className="app-scrollbar max-h-[420px] overflow-auto p-2">
              {results.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">No results</div>
              ) : (
                results.map((client) => (
                  <button
                    type="button"
                    key={client.id}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-slate-50"
                    onClick={() => {
                      router.push(`/clients/${client.id}`);
                      setOpen(false);
                    }}
                  >
                    <span>
                      <span className="block text-sm font-medium text-ink">{client.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {client.openTasks} open tasks
                      </span>
                    </span>
                    <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                      Client
                    </span>
                  </button>
                ))
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ClientRail({
  clients,
  children,
}: {
  clients: ClientSummary[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
        setHelpOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="ref-shell min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] border-r border-line bg-white/90 px-3 py-6 lg:block">
        <Brand />
        <Navigation pathname={pathname} />
      </aside>

      <div className="lg:pl-[240px]">
        <header className="sticky top-0 z-30 flex h-[82px] items-center justify-between border-b border-transparent bg-canvas/90 px-5 backdrop-blur-sm sm:px-8 lg:px-12">
          <div className="lg:hidden">
            <button
              type="button"
              aria-label="Open menu"
              className="rounded-xl border border-line bg-white p-2.5"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              aria-label="Search"
              title="Search (⌘K)"
              onClick={() => setCommandOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink hover:bg-slate-50"
            >
              <Search className="h-[19px] w-[19px]" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Help"
              onClick={() => setHelpOpen(true)}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink hover:bg-slate-50"
            >
              <CircleHelp className="h-[19px] w-[19px]" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Notifications"
              onClick={() => router.push("/notifications")}
              className="grid h-11 w-11 place-items-center rounded-full border border-line bg-white text-ink hover:bg-slate-50"
            >
              <Bell className="h-[19px] w-[19px]" aria-hidden />
            </button>
          </div>
        </header>
        <main className="px-5 pb-12 sm:px-8 lg:px-12">{children}</main>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-[70] bg-slate-950/20 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMobileOpen(false)}
          >
            <motion.aside
              className="h-full w-[270px] bg-white px-3 py-6 shadow-modal"
              initial={{ x: -270 }}
              animate={{ x: 0 }}
              exit={{ x: -270 }}
              transition={{ duration: 0.2 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between pr-2">
                <Brand />
                <button
                  type="button"
                  aria-label="Close menu"
                  className="rounded-full p-2 hover:bg-slate-50"
                  onClick={() => setMobileOpen(false)}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <Navigation pathname={pathname} close={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <CommandPalette open={commandOpen} setOpen={setCommandOpen} clients={clients} />

      <AnimatePresence>
        {helpOpen && (
          <motion.div
            className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/20 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setHelpOpen(false)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="Squirrl help"
              className="w-full max-w-md rounded-[18px] border border-line bg-white p-6 shadow-modal"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">Squirrl help</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Use the voice planner to create work, then manage details from a client board or
                    calendar. Press ⌘K or Ctrl+K anywhere to search.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close help"
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-50"
                  onClick={() => setHelpOpen(false)}
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
