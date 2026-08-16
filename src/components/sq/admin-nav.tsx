import Link from "next/link";

/**
 * The console's section list, shared by every admin page.
 *
 * Kept as one array rather than per-page markup so a new section appears
 * everywhere at once — a tab that exists on some pages and not others is how
 * an admin loses track of what the console can actually do.
 */

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/people", label: "People" },
  { href: "/admin/workspace", label: "Workspace" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/delivery", label: "Delivery" },
  { href: "/admin/ai", label: "AI usage" },
  { href: "/admin/system", label: "System" },
] as const;

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="sq-admin-tabs">
      {ADMIN_SECTIONS.map((section) => (
        <Link
          key={section.href}
          className={`sq-pill${section.href === current ? " amber" : ""}`}
          href={section.href}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
