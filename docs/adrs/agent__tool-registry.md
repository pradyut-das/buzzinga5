# ADR: Agent Tool Registry

## Context

The creator desk has two ways to reach the model: a Gemini Live voice session running in the
browser, and a text chatbot. Both must be able to read and change the planner, and both must agree
about what is true and what is allowed.

Running the voice session in the browser is a requirement, not a choice — Live is a bidirectional
audio stream, and Next.js route handlers cannot hold a WebSocket. That puts a model with tool
calls on the untrusted side of the wire.

## Decision

**One registry, two front ends.** `src/lib/agent/tools.ts` declares every tool and dispatches all
of them through `runTool`. The voice session and the chat route are both handed `ALL_TOOLS` and
both call `runTool`. A capability cannot exist on one surface and not the other.

**The browser never executes a tool.** Voice tool calls are posted to `/api/agent/tool`, which
re-derives the user from the session cookie and re-resolves their board memberships on every
call. The client is never trusted to say which boards it may touch.

**The API key never reaches the browser.** `/api/agent/session` mints a single-use ephemeral
Gemini token whose `liveConnectConstraints` pin the model, system instruction and tool list. A
tampered client cannot widen what the session may do.

**Writes are two-step.** Every mutation tool takes `confirmed`. The first call returns
`confirmation_required` with a human summary and writes nothing; only a second call with
`confirmed: true` runs it. This is the contract that makes a voice agent safe: a misheard sentence
produces a question, not a database change.

**Names, never ids.** Tools take board titles, column names and person names, and resolve them
server-side. Ambiguity raises `AgentError` with the candidates, which the model turns into a
clarifying question. UUIDs never enter the model's context.

**Membership, not board passwords.** The agent authorizes on `board_members` rather than the
board-password cookie that `requireBoardAccess` uses. A voice session outlives any single board's
unlock, and the agent works across every board at once.

## Consequences

- Adding a capability means adding a declaration and a `runTool` case; both surfaces get it.
- Mutations bypass the server actions in `src/actions/`, because those gate on the board-password
  cookie. They queue the same notifications and call the same `revalidatePath`.
- Bulk operations are capped at 25 rows and require a boundary (source column, priority, assignee
  or title text), so no single approved plan can rewrite a whole board.
- The stats layer (`src/lib/agent/stats.ts`) is shared by the dashboard, the chatbot and the voice
  agent, so a spoken answer can never disagree with the tile the user is looking at.
