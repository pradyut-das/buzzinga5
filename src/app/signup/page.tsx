import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign Up | Itacorubi Kanban",
};

interface SignupPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const { next } = await searchParams;
  const redirectTo = next?.startsWith("/") ? next : "/";

  const user = await getCurrentUser();
  if (user) {
    redirect(redirectTo);
  }

  return (
    <div className="flex min-h-screen items-center justify-center gradient-holographic px-6 py-12">
      <div className="w-full max-w-sm glass glass-strong border border-border/50 px-6 py-8 shadow-2xl">
        <h1 className="text-heading-lg mb-1">Create your account</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Boards you create or unlock while signed in are collected in your sidebar.
        </p>
        <AuthForm mode="signup" redirectTo={redirectTo} />
      </div>
    </div>
  );
}
