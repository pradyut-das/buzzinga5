# Feature: MCP Connector

## Overview

The desk's agent tools are available inside Claude and ChatGPT. Once connected, either app can be
asked about boards, tasks, docs and clients in ordinary language and will call the same tools the
voice agent and chatbot use.

A connector acts as the person who connected it. It reaches the boards they are a member of and
nothing else, and every call it makes is recorded in the AI usage ledger alongside the other agent
surfaces.

## User Flows

### Connecting from Claude

- Settings → Connectors → `Add custom connector`
- Enter the server URL: `https://<your-domain>/api/mcp`
- Claude opens a sign-in window; sign in with the same account used on the desk
- Approve the request on the consent screen, which names Claude and what it will reach
- The tools appear in the connector's tool list once approval completes

With dynamic client registration enabled in Supabase, Claude registers itself and there is nothing
to paste. With it disabled, register a client under Authentication → OAuth Apps first and paste its
Client ID and Secret into Claude's advanced settings.

### Connecting from ChatGPT

- Settings → Connectors → add a connector pointing at the same `/api/mcp` URL
- ChatGPT discovers the authorization server from the published metadata and starts the same
  sign-in

### Using it

- Ask in plain language — "which board is behind?", "what's overdue for Acme?"
- Read tools answer directly
- Mutating tools, when enabled, are marked destructive so Claude and ChatGPT ask for approval
  before running them. That prompt is the confirmation step: approve only what you recognise

## Configuration

| Variable           | Effect                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_PUBLIC_URL`   | The connector's public origin. Must match the URL given to Claude and ChatGPT, since tokens are audience-bound to it. Falls back to the Vercel deployment URL |
| `MCP_ALLOW_WRITES` | `true` exposes the 36 mutating tools. Unset or `false` leaves the connector read-only                                                                         |

Supabase Auth needs the OAuth 2.1 server enabled, with its authorization path set to
`/oauth/consent` so approvals land on this app's consent screen. Dynamic client registration is
optional: on, and connectors register themselves; off, and each must be added by hand under
Authentication → OAuth Apps.

## Behaviour Worth Knowing

- **Read-only until turned on.** A newly deployed connector exposes 18 read tools. Mutating tools
  require `MCP_ALLOW_WRITES=true`, and turning it back off blocks them immediately, including for
  a client that already knows their names
- **Board membership is the boundary.** The token says who is calling; membership decides what they
  reach. A connector cannot see a board its user was never added to
- **Failures are recorded too.** A refused or failed connector call still writes a ledger row, so a
  misbehaving integration is visible at `/admin/ai` rather than silent
