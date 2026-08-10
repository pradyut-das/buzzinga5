import { notFound } from "next/navigation";
import { ClientBoard } from "@/components/sq/client-board";
import { getClientBoard } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

export default async function ClientBoardPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const data = await getClientBoard(clientId);
  if (!data) notFound();

  return (
    <ClientBoard
      clientId={clientId}
      clientName={data.client.name}
      cadence={data.client.cadence}
      contact={data.client.contact}
      columns={data.columns}
      categories={data.categories}
    />
  );
}
