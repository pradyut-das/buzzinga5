import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ClientSummary } from "@/lib/agency/queries";

/**
 * The client grid. The page above it owns the header, so this stays the same
 * shape as `DocsList` — cards and an empty state.
 */
export function ClientCards({ clients }: { clients: ClientSummary[] }) {
  return (
    <>
      {clients.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}`}
              className="group rounded-[18px] border border-line bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-[#f2e3b3]"
            >
              <div className="flex items-start justify-between">
                <div
                  className="grid h-10 w-10 place-items-center rounded-xl text-sm font-semibold"
                  style={{
                    backgroundColor: `${client.color}14`,
                    color: client.color,
                  }}
                >
                  {client.initials.slice(0, 1)}
                </div>
                <ArrowUpRight className="h-5 w-5 text-slate-300 transition group-hover:text-accent-foreground" />
              </div>
              <h2 className="mt-8 text-xl font-semibold tracking-[-0.02em]">{client.name}</h2>
              <div className="mt-5 flex gap-5 text-sm">
                <div>
                  <div className="font-semibold text-ink">{client.openTasks}</div>
                  <div className="mt-1 text-muted">Active tasks</div>
                </div>
                <div>
                  <div className="font-semibold text-ink">
                    {client.nextDeadlineAt
                      ? client.nextDeadlineAt.toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "—"}
                  </div>
                  <div className="mt-1 text-muted">Next deadline</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-line bg-white p-12 text-center shadow-soft">
          <h2 className="text-lg font-semibold">No clients yet</h2>
          <p className="mt-2 text-sm text-muted">
            Clients connected to your workspace appear here.
          </p>
        </div>
      )}
    </>
  );
}
