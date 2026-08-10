import { notFound } from "next/navigation";
import { ClientBoard } from "@/components/sq/client-board";
import { TaskWorkspace } from "@/components/task/task-workspace";
import { getClientBoard, getTaskWorkspace } from "@/lib/agency/queries";

export const dynamic = "force-dynamic";

/** The rail only needs a name and an id, whichever role the person holds. */
const people = (rows: { id: string; name: string }[]) =>
  rows.map((row) => ({ id: row.id, name: row.name }));

const category = (row: { id: string; name: string; color: string }) => ({
  id: row.id,
  name: row.name,
  color: row.color,
});

export default async function TaskPage({
  params,
}: {
  params: Promise<{ clientId: string; taskId: string }>;
}) {
  const { clientId, taskId } = await params;
  const [board, detail] = await Promise.all([getClientBoard(clientId), getTaskWorkspace(taskId)]);
  if (!board || !detail) notFound();

  const { task } = detail;

  return (
    <ClientBoard
      clientId={clientId}
      clientName={board.client.name}
      cadence={board.client.cadence}
      contact={board.client.contact}
      columns={board.columns}
      categories={board.categories.map(category)}
      dimmed
    >
      <TaskWorkspace
        task={{
          id: task.id,
          boardId: task.boardId,
          title: task.title,
          status: task.status,
          doc: task.doc,
          dueAt: task.dueAt ? task.dueAt.toISOString() : null,
        }}
        categories={detail.categories.map(category)}
        category={detail.category ? category(detail.category) : null}
        clientId={detail.clientId}
        clients={detail.clients.map((client) => ({ id: client.id, name: client.name }))}
        contributors={detail.contributors.map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
        }))}
        assignees={people(detail.assignees)}
        collaborators={people(detail.collaborators)}
        stakeholders={people(detail.stakeholders)}
      />
    </ClientBoard>
  );
}
