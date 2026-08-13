import { eq } from "drizzle-orm";
import { db } from "@/db";
import { boardMembers, boards, clients, users } from "@/db/schema";
import { deleteClientCascade, deleteUserCascade } from "@/lib/admin/cascade";

const qaClients = [
  { id: "17afda80-64e3-4edc-b954-d320efeeb1cb", name: "Home Plasma QA" },
  { id: "c1da58af-0e40-487e-9bf4-79e942ee187f", name: "Home Plasma QA 2" },
] as const;

const ownerIds = new Set<string>();

for (const expected of qaClients) {
  const [client] = await db.select().from(clients).where(eq(clients.id, expected.id));
  if (!client) continue;
  if (client.name !== expected.name) {
    throw new Error(`Refusing to delete ${expected.id}: unexpected client name ${client.name}`);
  }

  const ownedBoards = await db
    .select({ ownerId: boards.ownerId })
    .from(boards)
    .where(eq(boards.clientId, expected.id));
  for (const board of ownedBoards) {
    if (board.ownerId) ownerIds.add(board.ownerId);
  }
  await deleteClientCascade(expected.id);
}

for (const ownerId of ownerIds) {
  const [user] = await db.select().from(users).where(eq(users.id, ownerId));
  if (!user?.email?.startsWith("seed-")) continue;

  const ownedBoard = await db
    .select({ id: boards.id })
    .from(boards)
    .where(eq(boards.ownerId, ownerId))
    .limit(1);
  const membership = await db
    .select({ boardId: boardMembers.boardId })
    .from(boardMembers)
    .where(eq(boardMembers.userId, ownerId))
    .limit(1);
  if (!ownedBoard.length && !membership.length) await deleteUserCascade(ownerId);
}
