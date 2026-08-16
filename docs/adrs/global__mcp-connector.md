# ADR: MCP Connector

The agent's tool registry is exposed to Claude and ChatGPT as a remote MCP server that verifies
Supabase-issued bearer tokens. This app is a resource server only: it never issues a token.

## Context

The tool registry in `src/lib/agent/tools.ts` already backs two front ends — the Live voice session
and the text chatbot — and both dispatch through `runTool`. Claude and ChatGPT can consume the same
capabilities over the Model Context Protocol, which would make them a third front end onto work
that is already written.

The obstacle is authentication, not capability. Every existing surface resolves the caller from the
Supabase session cookie. Connector traffic originates on Anthropic's and OpenAI's servers, so no
cookie is present and `getAgentScope()` cannot run.

The two vendors do not accept the same credentials. Claude can send a fixed header, but that
feature is in beta behind an access request. ChatGPT has no API key or custom header path at all
and requires OAuth 2.1. A token-based connector would therefore have reached exactly one of the two
targets, and only for users granted the beta.

## Decision

**OAuth 2.1, with Supabase as the authorization server.** The expensive half of OAuth is the
authorization server, and this project already has one: Supabase Auth publishes
`/auth/v1/.well-known/openid-configuration` with `authorization_endpoint`, `token_endpoint`, PKCE
`S256`, and an ES256 JWKS. Building a second authorization server would have duplicated identity
that already exists and given the desk two places where a session could be wrong.

So the app implements only the resource-server half: publish RFC 9728 protected resource metadata,
answer unauthenticated calls with a `WWW-Authenticate` challenge that points at it, and verify
presented tokens against Supabase's published keys.

**Tokens are treated as untrusted input.** `userFromBearer` checks the signature against the remote
JWKS, requires the issuer to be this project's auth server, and requires the audience to name this
resource. Only then is `sub` used. Audience validation is the defence against a token minted for
some other audience being replayed here; without it any valid Supabase token anywhere would open
these tools.

**Authorization stays where it already was.** The token establishes _who_ is calling and nothing
more. `agentScopeForUser` then derives board membership exactly as the cookie path does, so a
connector reaches precisely the boards its user is a member of. `getAgentScope()` was split rather
than duplicated, which is what keeps the two paths from drifting apart.

**The consent screen is ours to build.** Supabase runs the protocol but does not render the
approval step; it redirects to a path in this app with an `authorization_id`. That split is
deliberate on their side and correct: deciding whether an outside app may act as you is a product
decision. `/oauth/consent` names the client, the scopes in plain language, and the redirect target,
because a screen showing raw scope strings is not really asking anything.

**Stateless transport.** Each request builds its own transport and server. These run on serverless
invocations that share no memory, so a session held in one process would be missing from the next;
a per-request server also means an authenticated user cannot outlive their request.

**Writes are off by default.** `MCP_ALLOW_WRITES` gates the 36 mutating tools. The gate is checked
when a call arrives, not only when the catalogue is listed, so a client that remembers a tool name
from an earlier run cannot call it after writes are turned off.

## Consequences

Both targets are reachable through one endpoint, and a capability added to the registry appears in
Claude, ChatGPT, voice and chat together — the property the single registry existed to protect.

Supabase supports dynamic client registration but ships it disabled, so `registration_endpoint` is
absent from the published metadata until it is turned on. With it enabled Claude and ChatGPT
register themselves and no client secret is handed around; with it off, a client must be
pre-registered in the dashboard and its ID pasted into Claude's advanced settings. Enabling it
means any MCP client can register against the project, which is why the consent screen — not
registration — is the gate that matters.

Supabase stamps `aud: "authenticated"` on ordinary session tokens and the resource URL on tokens
from its OAuth flow, so both are accepted. This is weaker than strict RFC 8707 audience binding:
any valid session token for this project opens the connector. That is the same authority the user
already holds in the browser, so it grants nothing new — but it does mean a leaked session token
reaches the tools, and tightening it would require issuing MCP-audience tokens ourselves.

MCP has no equivalent of the two-turn confirmation the voice and chat surfaces use. Mutating tools
are marked `destructiveHint`, which asks the client to prompt, but the prompt is enforced by Claude
and ChatGPT rather than by this server. The client-side approval is the real gate on a write.
