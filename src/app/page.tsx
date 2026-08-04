import { Github } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { RecentBoards } from "@/components/recent-boards";
import { CreateBoardButton } from "@/components/create-board-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col gradient-holographic">
      {user && (
        <header className="flex items-center justify-end gap-3 px-6 py-4">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <SignOutButton />
        </header>
      )}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mx-auto max-w-4xl glass glass-strong border border-border/50 px-8 py-10 shadow-2xl">
          <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl md:text-7xl">
            Itacorubi
          </h1>
          <p className="mt-4 text-xl text-muted-foreground sm:text-2xl">
            Kanban boards for cross-team collaboration
          </p>
          <p className="mx-auto mt-2 max-w-lg text-muted-foreground">
            Sign in, create a board, share the link.
            <br />
            Everyone you invite works in the same place.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {user ? (
              <CreateBoardButton />
            ) : (
              <Button size="lg" className="h-14 px-6" asChild>
                <Link href="/login">Sign in to create a board</Link>
              </Button>
            )}

            <Button variant="outline" size="lg" className="h-14 px-6" asChild>
              <a
                href="https://github.com/Superfiliate/itacorubi-kanban"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </a>
            </Button>
          </div>

          <RecentBoards />
        </div>
      </main>
    </div>
  );
}
