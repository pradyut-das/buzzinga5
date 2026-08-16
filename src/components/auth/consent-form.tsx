"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface ConsentFormProps {
  authorizationId: string;
  userEmail: string;
}

interface Details {
  clientName: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * Plain-language readings of the scopes Supabase issues. An approval screen
 * that shows raw scope strings is not really asking anything: the person has
 * to know what "openid" grants before they can agree to it.
 */
const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirm who you are",
  email: "See your email address",
  profile: "See your name and profile details",
  offline_access: "Stay connected when you are away",
};

function describe(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope;
}

export function ConsentForm({ authorizationId, userEmail }: ConsentFormProps) {
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      const supabase = createClient();
      const { data, error: detailsError } =
        await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

      if (!active) return;

      if (detailsError || !data) {
        setError(detailsError?.message ?? "This authorization request is no longer valid.");
        return;
      }

      // Consent already given for these scopes: Supabase returns the finished
      // redirect instead of details, and re-asking would be noise.
      if (!("authorization_id" in data)) {
        window.location.href = data.redirect_url;
        return;
      }

      setDetails({
        clientName: data.client.name ?? "An application",
        redirectUri: data.redirect_uri,
        scopes: data.scope.split(" ").filter(Boolean),
      });
    }

    void load();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setDeciding(true);
    setError(null);

    const supabase = createClient();
    const { data, error: decisionError } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId, {
          skipBrowserRedirect: true,
        })
      : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

    if (decisionError || !data) {
      setError(decisionError?.message ?? "Could not complete that. Try connecting again.");
      setDeciding(false);
      return;
    }

    // The redirect carries the authorization code (or the denial), so it has
    // to be followed for the connecting app to learn the outcome.
    window.location.href = data.redirect_url;
  }

  if (error && !details) {
    return (
      <>
        <h1 className="text-heading-lg mb-1">Request expired</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </>
    );
  }

  if (!details) {
    return <p className="text-sm text-muted-foreground">Checking the request…</p>;
  }

  return (
    <>
      <h1 className="text-heading-lg mb-1">Authorize {details.clientName}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        It will act as <span className="text-foreground">{userEmail}</span> and reach the boards you
        are a member of.
      </p>

      <ul className="mb-6 space-y-2 text-sm">
        {details.scopes.map((scope) => (
          <li key={scope} className="flex gap-2">
            <span aria-hidden className="text-muted-foreground">
              •
            </span>
            <span>{describe(scope)}</span>
          </li>
        ))}
      </ul>

      {/* The destination is what distinguishes the real app from something
          wearing its name, so it is shown rather than tucked away. */}
      <p className="mb-6 text-xs text-muted-foreground break-all">
        Returns you to {details.redirectUri}
      </p>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button onClick={() => void decide(true)} disabled={deciding} className="flex-1">
          {deciding ? "Working…" : "Authorize"}
        </Button>
        <Button
          variant="outline"
          onClick={() => void decide(false)}
          disabled={deciding}
          className="flex-1"
        >
          Deny
        </Button>
      </div>
    </>
  );
}
