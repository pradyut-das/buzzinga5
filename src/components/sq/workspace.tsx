"use client";

import Link from "next/link";
import { AgentSpark } from "@/components/sq/mascot";

/**
 * The workspace chrome every screen except the homepage shares: a breadcrumb,
 * a contextual agent action, and a plain-language note about what the agent
 * can do here. The note is not decoration — the spec requires every screen to
 * state its capabilities so the founder never guesses.
 */
export function WorkspaceHeader({
  crumb,
  action,
  actionHref,
}: {
  crumb: string;
  action?: string;
  actionHref?: string;
}) {
  return (
    <header className="sq-top">
      <span className="sq-crumb">{crumb}</span>
      <div className="sq-top-actions">
        {action &&
          (actionHref ? (
            <Link href={actionHref} className="sq-pill amber" title={action}>
              Ask Squirrl
            </Link>
          ) : (
            <span className="sq-pill amber" title={action}>
              Ask Squirrl
            </span>
          ))}
      </div>
    </header>
  );
}

export function AgentNote({ children }: { children: React.ReactNode }) {
  return (
    <details className="sq-agent-note">
      <summary>
        <AgentSpark />
        What Squirrl can do here
      </summary>
      <span>{children}</span>
    </details>
  );
}

export function ToolRow({ tools }: { tools: string[] }) {
  return (
    <div className="sq-toolrow">
      {tools.map((tool) => (
        <span key={tool} className="sq-tool">
          {tool}
        </span>
      ))}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  aside,
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="sq-section-head">
      <div>
        <div className="sq-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      {aside}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="sq-empty">
      <strong>{title}</strong>
      {hint && <span>{hint}</span>}
    </div>
  );
}
