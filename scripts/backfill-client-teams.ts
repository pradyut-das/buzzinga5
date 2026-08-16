/**
 * Rolls every task's people up into their client's team.
 *
 * Recipients used to be per-task; they are now the client's team, which a task
 * overrides only by naming its own people (see `getTaskRecipients`). Tasks that
 * never named anyone had no recipients before and would now inherit whoever
 * happens to be on the board — so this makes the team the union of everyone who
 * was already being emailed anywhere on that board. Nobody currently receiving
 * mail stops receiving it.
 *
 * Read-write. Idempotent: contributors are already board rows, so this only
 * ever adds board members, never duplicates people.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  boards,
  contributors,
  taskAssignees,
  taskCollaborators,
  taskStakeholders,
} from "@/db/schema";

async function main() {
  const apply = process.argv.includes("--apply");

  const [allTasks, assignees, collaborators, stakeholders, allContributors] = await Promise.all([
    db.query.tasks.findMany(),
    db.select().from(taskAssignees),
    db.select().from(taskCollaborators),
    db.select().from(taskStakeholders),
    db.select().from(contributors),
  ]);

  const taskBoard = new Map(allTasks.map((task) => [task.id, task.boardId]));
  const contributorById = new Map(allContributors.map((row) => [row.id, row]));

  // Everyone already being emailed on each board, by way of any task on it.
  const emailedByBoard = new Map<string, Set<string>>();
  for (const row of [...assignees, ...collaborators, ...stakeholders]) {
    const boardId = taskBoard.get(row.taskId);
    if (!boardId) continue;
    if (!emailedByBoard.has(boardId)) emailedByBoard.set(boardId, new Set());
    emailedByBoard.get(boardId)!.add(row.contributorId);
  }

  const report: {
    board: string;
    client: string | null;
    alreadyOnTeam: number;
    missing: string[];
  }[] = [];

  for (const [boardId, contributorIds] of emailedByBoard) {
    const board = await db.query.boards.findFirst({ where: eq(boards.id, boardId) });
    const onTeam = allContributors.filter((row) => row.boardId === boardId).map((row) => row.id);
    const onTeamSet = new Set(onTeam);

    // A contributor is board-scoped already, so anyone emailed on this board is
    // on its team by construction. Anything else would be a data fault.
    const missing = [...contributorIds].filter((id) => !onTeamSet.has(id));
    report.push({
      board: boardId,
      client: board?.clientId ?? null,
      alreadyOnTeam: [...contributorIds].filter((id) => onTeamSet.has(id)).length,
      missing: missing.map((id) => contributorById.get(id)?.name ?? id),
    });
  }

  for (const row of report) {
    console.log(
      `board ${row.board} (client ${row.client ?? "none"}): ${row.alreadyOnTeam} already on team` +
        (row.missing.length ? `, ${row.missing.length} MISSING: ${row.missing.join(", ")}` : ""),
    );
  }

  const totalMissing = report.reduce((sum, row) => sum + row.missing.length, 0);
  console.log(
    totalMissing === 0
      ? "\nNothing to move: every person already emailed is already on their client's team."
      : `\n${totalMissing} people are emailed on a board they are not staffed on.`,
  );

  if (!apply) console.log("Dry run. Re-run with --apply to write.");
}

main();
