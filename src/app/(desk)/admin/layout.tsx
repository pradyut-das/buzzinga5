import "@/styles/desk-v2.css";
import "@/styles/admin.css";

/**
 * The console's pages are built from the `sq-*` design system, which lives in
 * `desk-v2.css` and is imported per route rather than globally. This layout
 * carries it once for every page under /admin.
 *
 * `admin.css` must follow it: that sheet's `.sq-main` is positioned for a
 * standalone page and has to be put back in the flow of the desk shell. The
 * wrapper class is what scopes those corrections to the console.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="sq sq-admin-page">{children}</div>;
}
