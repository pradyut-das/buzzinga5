import { test, expect } from "@playwright/test";

/**
 * The remote MCP connector that Claude and ChatGPT attach to.
 *
 * These calls arrive from Anthropic's and OpenAI's servers, not a browser, so
 * the session cookie every other surface relies on is absent by definition.
 * Bearer verification is therefore the only thing standing between an
 * anonymous request and someone's boards, and it is what these tests pin down:
 * that no token means no access, that an unverifiable token is refused, and
 * that a connector can discover where to log in.
 */
test.describe("MCP connector", () => {
  const rpc = { jsonrpc: "2.0", id: 1, method: "tools/list" };

  test("refuses tool calls that carry no token", async ({ request }) => {
    const response = await request.post("/api/mcp", { data: rpc });

    expect(response.status()).toBe(401);
    // The challenge is not decoration: without it a connector has no way to
    // find the metadata, and the OAuth flow can never begin.
    expect(response.headers()["www-authenticate"]).toContain("resource_metadata=");

    // A refusal must not leak the tool catalogue it was protecting.
    const body = await response.json();
    expect(body).not.toHaveProperty("result");
  });

  test("refuses a token it cannot verify", async ({ request }) => {
    // Shaped like a JWT so the rejection is proven to come from signature
    // verification rather than from the string failing to parse.
    const forged = [
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({ sub: "attacker", email: "attacker@example.com" })).toString(
        "base64url",
      ),
      "",
    ].join(".");

    const response = await request.post("/api/mcp", {
      data: rpc,
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).not.toHaveProperty("result");
  });

  test("publishes the metadata a connector needs to start OAuth", async ({ request }) => {
    const response = await request.get("/.well-known/oauth-protected-resource");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.resource).toContain("/api/mcp");
    // Supabase Auth is the authorization server; this app only ever verifies
    // tokens, so the list must point away from here.
    expect(body.authorization_servers?.[0]).toContain("/auth/v1");
  });
});
