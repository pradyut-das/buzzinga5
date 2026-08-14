import { notFound } from "next/navigation";
import Link from "next/link";
import { CreateDocAction } from "@/components/reference/page-create-actions";
import { ClientActions } from "@/components/sq/client-actions";
import { ClientBoard } from "@/components/sq/client-board";
import { DocsList } from "@/components/sq/docs-list";
import { getClientBoard, listDocs } from "@/lib/agency/queries";
import { addBoardMember } from "@/lib/auth/membership";
import { getCurrentUser } from "@/lib/auth/session";
import { listAdminUsers } from "@/lib/admin/queries";
import { getCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

export default async function ClientBoardPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const [data, admin] = await Promise.all([getClientBoard(clientId), getCurrentAdmin()]);
  if (!data) notFound();

  // Only an admin sees the edit form, so only an admin pays for the account list.
  const accounts = admin
    ? (await listAdminUsers()).map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
      }))
    : [];

  // Opening a client's board joins you to it, which is what puts that client in
  // the voice agent's scope — every agent tool is confined to board membership.
  const user = await getCurrentUser();
  if (user && data.board?.id) await addBoardMember(data.board.id, user.id);

  const docs = await listDocs(clientId);
  const { client } = data;

  return (
    <div className="mx-auto max-w-[1500px]">
      <ClientBoard
        clientId={clientId}
        clientName={client.name}
        cadence={client.cadence}
        contact={client.contact}
        nextDeadline={client.nextDeadlineAt?.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        columns={data.columns}
        categories={data.categories}
        actions={
          admin ? (
            <ClientActions
              accounts={accounts}
              client={{
                id: client.id,
                name: client.name,
                initials: client.initials,
                color: client.color,
                contact: client.contact,
                cadence: client.cadence,
                archived: Boolean(client.archivedAt),
              }}
            />
          ) : null
        }
      />

      <section className="mt-12 border-t border-line pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4 pb-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.025em]">Docs</h2>
            <p className="mt-1.5 text-[15px] text-muted">The briefs written for {client.name}.</p>
          </div>
          <div className="flex items-center gap-3">
            {docs.length > 0 && (
              <Link
                href="/docs"
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                All docs
              </Link>
            )}
            <CreateDocAction clientId={clientId} />
          </div>
        </div>
        <DocsList docs={docs} hrefFor={(doc) => `/clients/${clientId}/docs/${doc.id}`} />
      </section>
    </div>
  );
}
