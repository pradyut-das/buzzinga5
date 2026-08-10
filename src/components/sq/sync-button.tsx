"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Pulls the third-party feed on demand and reports honestly if it is unconfigured. */
export function SyncButton({ provider }: { provider: "whatsapp" | "instagram" }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done" | "off">("idle");

  return (
    <button
      type="button"
      className="sq-pill"
      disabled={state === "syncing"}
      onClick={async () => {
        setState("syncing");
        const response = await fetch("/api/integrations/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const payload = (await response.json()) as { status?: string };
        setState(payload.status === "ok" ? "done" : "off");
        router.refresh();
      }}
    >
      {state === "syncing"
        ? "Syncing…"
        : state === "off"
          ? "Provider not configured"
          : state === "done"
            ? "Synced"
            : "Sync now"}
    </button>
  );
}
