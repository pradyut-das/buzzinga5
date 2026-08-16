import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { MCP_ISSUER, MCP_RESOURCE_URL } from "@/lib/mcp/config";
import { mirrorUser } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Thrown when a request carries no usable token. The route turns this into a
 * 401 with a `WWW-Authenticate` challenge, which is what tells Claude and
 * ChatGPT where to find the metadata and begin the OAuth dance.
 */
export class McpUnauthorized extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpUnauthorized";
  }
}

// Cached across requests on purpose: the key set rotates rarely and jose
// refetches on an unknown `kid`, so a module-level set costs one round trip
// per cold start rather than one per tool call.
const jwks = createRemoteJWKSet(new URL(`${MCP_ISSUER}/.well-known/jwks.json`));

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * RFC 8707 requires a resource server to reject tokens that were not issued
 * for it, so that a token stolen from another audience cannot be replayed
 * here. Supabase stamps `aud: "authenticated"` on its ordinary session tokens
 * and the resource URL on tokens obtained through its OAuth 2.1 flow, so both
 * are accepted — but nothing else is.
 */
function audienceAllowed(payload: JWTPayload): boolean {
  const aud = payload.aud;
  const values = Array.isArray(aud) ? aud : aud ? [aud] : [];
  return values.some((value) => value === MCP_RESOURCE_URL || value === "authenticated");
}

/**
 * Verifies a bearer token and resolves it to the local user it speaks for.
 *
 * The token is treated as untrusted input: the signature is checked against
 * Supabase's published keys, the issuer must be this project's auth server,
 * and the audience must name this resource. Only then is the `sub` claim used
 * to mirror the account, which is what every downstream board-membership check
 * is keyed on.
 */
export async function userFromBearer(token: string): Promise<SessionUser> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: MCP_ISSUER }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "verification failed";
    throw new McpUnauthorized(`Invalid access token: ${reason}`);
  }

  if (!audienceAllowed(payload)) {
    throw new McpUnauthorized("Access token was not issued for this server.");
  }

  const id = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!id || !email) {
    throw new McpUnauthorized("Access token carries no user identity.");
  }

  const claimedName = typeof payload.name === "string" ? payload.name.trim() : "";
  return mirrorUser(id, email, claimedName || email.split("@")[0]);
}

/** The challenge that points a connector at our protected-resource metadata. */
export function challengeHeader(): string {
  const metadata = `${new URL(MCP_RESOURCE_URL).origin}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadata}"`;
}
