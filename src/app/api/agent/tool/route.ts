import { NextResponse } from "next/server";
import { getAgentScope } from "@/lib/agent/scope";
import { ALL_TOOLS, runTool } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

const TOOL_NAMES = new Set(ALL_TOOLS.map((tool) => tool.name));

/**
 * The voice session runs in the browser, so its tool calls come back here to be
 * executed. Authorization is re-derived from the session cookie on every call:
 * the client is never trusted to say which boards it may touch.
 */
export async function POST(request: Request) {
  let body: { name?: string; input?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", message: "Malformed request." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  if (!TOOL_NAMES.has(name)) {
    return NextResponse.json(
      { status: "error", message: `Unknown tool "${name}".` },
      { status: 400 },
    );
  }

  try {
    const scope = await getAgentScope();
    const result = await runTool(scope, name, body.input ?? {});
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool call failed.";
    // requireUser throws for signed-out requests; that is a 401, not a bug.
    const unauthorized = /not signed in/i.test(message);
    return NextResponse.json(
      { status: "error", message: unauthorized ? "Sign in again to use the agent." : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
