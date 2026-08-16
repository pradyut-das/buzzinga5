import { NextResponse } from "next/server";
import { MCP_ISSUER } from "@/lib/mcp/config";

export const dynamic = "force-dynamic";

/**
 * Some connectors probe the resource origin for authorization server metadata
 * before following `authorization_servers`. Supabase publishes the real
 * document, so redirect rather than restate it: a copy here would go stale the
 * moment Supabase rotates an endpoint, and clients must reject metadata whose
 * `issuer` does not match where they fetched it from.
 */
export function GET() {
  return NextResponse.redirect(`${MCP_ISSUER}/.well-known/openid-configuration`, 302);
}
