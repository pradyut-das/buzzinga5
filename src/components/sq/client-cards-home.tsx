import Link from "next/link";
import type { ClientSummary } from "@/lib/agency/queries";

/**
 * Non-admin homepage. Members don't get the voice agent — a client is a
 * board, so a grid of client cards is the whole desk for everyone else.
 */
export function ClientCardsHome({ clients }: { clients: ClientSummary[] }) {
  return (
    <main className="sq-main sq-client-cards-home">
      <header className="sq-top">
        <span className="sq-crumb">Desk / Clients</span>
      </header>

      <div className="sq-client-card-grid">
        {clients.map((client) => (
          <Link key={client.id} href={`/clients/${client.id}`} className="sq-client-card">
            <span className="sq-avatar" style={{ ["--av" as string]: client.color }}>
              {client.initials}
            </span>
            <strong>{client.name}</strong>
            <span className="sq-meta">
              <i
                className={`sq-dot${client.health === "risk" ? " bad" : client.health === "watch" ? " warn" : ""}`}
              />
              {client.openTasks} open
            </span>
            {client.pendingApprovals > 0 && (
              <span className="sq-count">{client.pendingApprovals}</span>
            )}
          </Link>
        ))}
        {!clients.length && <p className="sq-empty">No clients yet</p>}
      </div>
    </main>
  );
}
