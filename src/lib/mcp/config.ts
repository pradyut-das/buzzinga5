import { SUPABASE_URL } from "@/lib/supabase/config";

/* oxlint-disable no-process-env */

/**
 * The connector's own public URL. Claude and ChatGPT call this server from
 * their own infrastructure, so the origin cannot be inferred from a request
 * the way a same-origin fetch would allow: it has to be stated. On Vercel the
 * deployment URL is the sensible default, and MCP_PUBLIC_URL overrides it for
 * a custom domain or a tunnel during development.
 */
function publicOrigin(): string {
  const explicit = process.env.MCP_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:5800";
}

/** True when mutating tools are offered to connectors. Read-only by default. */
export function mcpWritesAllowed(): boolean {
  return process.env.MCP_ALLOW_WRITES === "true";
}

/* oxlint-enable no-process-env */

/** The `resource` identifier tokens must be audience-bound to. */
export const MCP_RESOURCE_URL = `${publicOrigin()}/api/mcp`;

/**
 * Supabase Auth is the authorization server. Its OAuth 2.1 endpoints and
 * ES256 JWKS already exist, so this app is only ever a resource server: it
 * verifies tokens, it never issues them.
 */
export const MCP_ISSUER = `${SUPABASE_URL}/auth/v1`;

/**
 * `offline_access` earns its place: without a refresh token the connector
 * stops working roughly an hour after it is set up, when the access token
 * expires, and presents as a connection that silently went dead rather than
 * one that needs signing in again.
 */
export const MCP_SCOPES = ["openid", "email", "profile", "offline_access"];
