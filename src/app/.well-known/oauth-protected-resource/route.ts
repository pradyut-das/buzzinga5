import { NextResponse } from "next/server";
import { MCP_ISSUER, MCP_RESOURCE_URL, MCP_SCOPES } from "@/lib/mcp/config";

export const dynamic = "force-dynamic";

/**
 * RFC 9728 protected resource metadata. This is the first thing Claude and
 * ChatGPT fetch after a 401: it names this server as the resource and points
 * them at Supabase as the authorization server to log in against.
 */
export function GET() {
  return NextResponse.json(
    {
      resource: MCP_RESOURCE_URL,
      authorization_servers: [MCP_ISSUER],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ["header"],
      resource_name: "Squirrl",
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
