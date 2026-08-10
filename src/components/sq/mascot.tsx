/**
 * The Squirrl character. It is the visible personality of the live agent, so
 * it appears where the agent is doing something — never as decoration on
 * every card. The mark, the ambient homepage characters and the agent
 * signature are the same drawing at three sizes.
 */
export function SquirrlMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden>
      <path
        d="M43 20c12-15 22-1 14 11-5 8-16 7-23 4 6-1 12-4 13-9 1-3-1-5-4-6Z"
        fill="currentColor"
      />
      <path
        d="M24 27c0-8 5-14 12-14l-2 7c7 3 11 10 10 18-1 10-8 16-19 15-9-1-15-8-15-17 0-6 3-10 8-13l1-9 8 6"
        fill="currentColor"
      />
      <circle cx="31" cy="26" r="2.5" fill="#201a0b" />
      <path
        d="M14 46c7-3 18-2 27 5"
        fill="none"
        stroke="#201a0b"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The amber signature that marks a line of text as coming from the agent. */
export function AgentSpark() {
  return <SquirrlMark className="sq-agent-spark" />;
}

/**
 * The two ambient characters on the homepage. They make the agent's proactive
 * roles legible before the founder says anything: one watches the approval
 * queue, the other collects ideas from research.
 */
export function AmbientSquirrl({ side, label }: { side: "one" | "two"; label: string }) {
  return (
    <div className={`sq-mascot ${side}`} aria-hidden>
      <SquirrlMark />
      <div className="sq-mascot-label">{label}</div>
    </div>
  );
}
