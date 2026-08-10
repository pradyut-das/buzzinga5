import { redirect, notFound } from "next/navigation";
import { getBoardPasswordOptional } from "@/lib/secure-board";
import { db } from "@/db";
import { boards } from "@/db/schema";
import { eq } from "drizzle-orm";
import { UnlockForm } from "@/components/board/unlock-form";

// This page depends on per-request cookies for board authorization.
export const dynamic = "force-dynamic";

interface UnlockPageProps {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<{ password?: string; error?: string }>;
}

export default async function UnlockPage({ params, searchParams }: UnlockPageProps) {
  const { boardId } = await params;
  const { password: initialPassword, error } = await searchParams;

  // Verify board exists first
  const board = await db.query.boards.findFirst({
    where: eq(boards.id, boardId),
  });

  if (!board) {
    notFound();
  }

  // Check if already unlocked
  const password = await getBoardPasswordOptional(boardId);
  if (password) {
    redirect(`/boards/${boardId}`);
  }

  // Determine error message based on error query param
  let errorMessage: string | null = null;
  if (error === "invalid") {
    errorMessage = "Invalid password. Please try again.";
  } else if (error === "notfound") {
    errorMessage = "Board not found.";
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-6">
      <div className="glass glass-strong w-full max-w-md rounded-lg p-8">
        <h1 className="mb-2 text-2xl font-semibold">Board Locked</h1>
        <p className="mb-6 text-muted-foreground">Enter the password to access this board</p>
        <UnlockForm
          boardId={boardId}
          initialPassword={initialPassword}
          initialError={errorMessage}
        />
      </div>
    </div>
  );
}
