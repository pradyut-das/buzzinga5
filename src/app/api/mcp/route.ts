import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerToken, challengeHeader, McpUnauthorized, userFromBearer } from "@/lib/mcp/auth";
import { buildMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: "unauthorized", error_description: message }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      // Without this header a connector has no way to discover where to log
      // in, and the OAuth flow never starts.
      "www-authenticate": challengeHeader(),
    },
  });
}

/**
 * The remote MCP endpoint that Claude custom connectors and ChatGPT talk to.
 *
 * Stateless by design: each request builds its own transport and server. These
 * calls arrive on serverless invocations that share no memory, so a session
 * held in one process would be missing from the next — and a per-request
 * server also means the authenticated user can never outlive their request.
 */
async function handle(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return unauthorized("Missing bearer token.");

  let user;
  try {
    user = await userFromBearer(token);
  } catch (error) {
    if (error instanceof McpUnauthorized) return unauthorized(error.message);
    throw error;
  }

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = buildMcpServer(user);
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    // Stateless mode keeps nothing between requests, so releasing the pair
    // here is what stops a long-lived function from accumulating them.
    await transport.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
