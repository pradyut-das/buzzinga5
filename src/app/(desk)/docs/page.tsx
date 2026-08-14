import { CreateDocAction } from "@/components/reference/page-create-actions";
import { PageHeader } from "@/components/reference/page-header";
import { DocsList } from "@/components/sq/docs-list";
import { listClients, listDocs } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function DocsPage() {
  const [docs, clients] = await Promise.all([listDocs(), listClients()]);

  const groups = new Map<string, typeof docs>();
  for (const doc of docs) {
    const key = doc.clientName ?? "Unassigned";
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        title="Docs"
        description="Every task brief, split into blocks you can search and deep-link to."
      >
        <CreateDocAction
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
        />
      </PageHeader>

      {docs.length ? (
        <div className="space-y-10">
          {ordered.map(([clientName, clientDocs]) => (
            <section key={clientName}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
                {clientName}
              </h2>
              <DocsList
                docs={clientDocs}
                hrefFor={(doc) => `/clients/${doc.clientId}/docs/${doc.id}`}
              />
            </section>
          ))}
        </div>
      ) : (
        <DocsList docs={[]} hrefFor={() => "#"} />
      )}
    </div>
  );
}
