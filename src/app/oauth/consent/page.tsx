import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsentForm } from "@/components/auth/consent-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Authorize | Squirrl",
};

interface ConsentPageProps {
  searchParams: Promise<{ authorization_id?: string }>;
}

/**
 * The consent screen Supabase hands an OAuth authorization off to.
 *
 * Supabase runs the protocol but deliberately does not render the approval
 * step: deciding whether an outside app may act as you is a product decision,
 * so it belongs in the product. Claude and ChatGPT land here mid-flow when
 * connecting to the MCP connector.
 */
export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id: authorizationId } = await searchParams;

  // Approving is an act by a specific person, so an anonymous visitor is sent
  // to sign in and comes back to the same request rather than being handed a
  // consent screen with nobody behind it.
  const user = await getCurrentUser();
  if (!user) {
    const next = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId ?? "")}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <div className="app-canvas flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm glass glass-strong border border-border/50 px-6 py-8 shadow-2xl">
        {authorizationId ? (
          <ConsentForm authorizationId={authorizationId} userEmail={user.email} />
        ) : (
          <>
            <h1 className="text-heading-lg mb-1">Nothing to authorize</h1>
            <p className="text-sm text-muted-foreground">
              This page is opened by an app asking for access. Start the connection from that app
              instead.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
