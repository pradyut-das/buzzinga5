import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In | Squirrl",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  const redirectTo = next?.startsWith("/") ? next : "/";

  const user = await getCurrentUser();
  if (user) {
    redirect(redirectTo);
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm glass glass-strong border border-border/50 px-6 py-8 shadow-2xl">
        <h1 className="text-heading-lg mb-1">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Sign in to keep your boards in the sidebar.
        </p>
        <AuthForm mode="signin" redirectTo={redirectTo} />
      </div>
    </div>
  );
}
