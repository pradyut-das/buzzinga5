import { NextResponse } from "next/server";
import { getAgentScope } from "@/lib/agent/scope";
import { ALL_TOOLS, runTool } from "@/lib/agent/tools";
import { GEMINI_LIVE_MODEL } from "@/lib/agent/gemini";
import { subjectFromScope } from "@/lib/ai/subject";
import { recordAiUsage } from "@/lib/ai/usage";

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
    const startedAt = Date.now();
    const result = await runTool(scope, name, body.input ?? {});

    // Tool calls from the voice session spend no tokens in this process, but
    // they are the record of what the agent actually did on someone's boards.
    // Logging them next to the model calls means one query answers both "what
    // did this cost?" and "what changed, and who asked for it?".
    await recordAiUsage({
      subject: subjectFromScope(scope),
      surface: "voice_tool",
      operation: name,
      model: GEMINI_LIVE_MODEL,
      status: result.status === "error" ? "error" : "ok",
      durationMs: Date.now() - startedAt,
      errorMessage: result.status === "error" ? result.message : undefined,
      detail: { toolStatus: result.status },
    });

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
