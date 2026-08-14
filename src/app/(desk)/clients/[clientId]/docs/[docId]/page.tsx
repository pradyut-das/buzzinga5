import { notFound } from "next/navigation";
import { DocViewer } from "@/components/docs/doc-viewer";
import { getDocViewer } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function ClientDocPage({
  params,
}: {
  params: Promise<{ clientId: string; docId: string }>;
}) {
  const { clientId, docId } = await params;
  const doc = await getDocViewer(docId);
  if (!doc || doc.client?.id !== clientId) notFound();

  return <DocViewer doc={doc} />;
}
