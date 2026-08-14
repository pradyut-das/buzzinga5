"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  CalendarDays,
  CircleHelp,
  FileText,
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
import { useEffect, useState } from "react";
import { openSearchPalette } from "@/components/search/search-palette";

const NAV: Array<{ href: string; label: string; Icon: LucideIcon }> = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/clients", label: "Clients", Icon: Users },
  { href: "/docs", label: "Docs", Icon: FileText },
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

/** A doc under a client still belongs to Docs, so it wins over Clients. */
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/docs") return pathname.startsWith("/docs") || pathname.includes("/docs/");
  if (href === "/clients") return pathname.startsWith("/clients") && !pathname.includes("/docs/");
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

export function ClientRail({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘K is handled by the global SearchPalette.
      if (event.key === "Escape") {
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
              onClick={() => openSearchPalette()}
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
