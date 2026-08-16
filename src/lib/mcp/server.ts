import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { agentScopeForUser } from "@/lib/agent/scope";
import { ALL_TOOLS, READ_TOOLS, runTool, type ToolResult } from "@/lib/agent/tools";
import { GEMINI_LIVE_MODEL } from "@/lib/agent/gemini";
import { mcpWritesAllowed } from "@/lib/mcp/config";
import { recordAiUsage } from "@/lib/ai/usage";
import { subjectFromScope } from "@/lib/ai/subject";
import type { SessionUser } from "@/lib/auth/session";

const READ_TOOL_NAMES = new Set(READ_TOOLS.map((tool) => tool.name));

/** The tools a connector may see, which is every tool unless writes are off. */
function exposedTools() {
  return mcpWritesAllowed() ? ALL_TOOLS : READ_TOOLS;
}

/**
 * MCP has no equivalent of the two-turn confirmation the voice and chat front
 * ends use, so the hint is what tells Claude and ChatGPT to put a mutation
 * behind a human approval prompt. Marking reads idempotent also lets them skip
 * prompting for the harmless majority.
 */
function annotationsFor(name: string) {
  const readOnly = READ_TOOL_NAMES.has(name);
  return {
    readOnlyHint: readOnly,
    destructiveHint: !readOnly,
    idempotentHint: readOnly,
    openWorldHint: false,
  };
}

/** MCP returns content blocks; the agent tools return a tagged result. */
function toContent(result: ToolResult) {
  const text =
    result.status === "ok"
      ? JSON.stringify(result.data, null, 2)
      : result.status === "error"
        ? result.message
        : result.summary;

  return { content: [{ type: "text" as const, text }], isError: result.status === "error" };
}

/**
 * A server instance bound to one authenticated user.
 *
 * Built per request rather than shared, because the scope it closes over is
 * that user's board membership: a cached instance would hand the next caller
 * the previous caller's boards.
 */
export function buildMcpServer(user: SessionUser): Server {
  const server = new Server({ name: "squirrl", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: exposedTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parametersJsonSchema,
      annotations: annotationsFor(tool.name),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;

    // The exposed list is the authorization boundary, not just a display
    // filter: a client that remembers a write tool from a run with writes
    // enabled must not be able to call it after they are turned off.
    if (!exposedTools().some((tool) => tool.name === name)) {
      return toContent({ status: "error", message: `Unknown tool "${name}".` });
    }

    const scope = await agentScopeForUser(user);
    const startedAt = Date.now();
    const result = await runTool(scope, name, request.params.arguments ?? {});

    // Connector traffic spends no tokens in this process, but it is a record
    // of what an outside model did on someone's boards — which belongs in the
    // same ledger as every other agent surface.
    await recordAiUsage({
      subject: subjectFromScope(scope),
      surface: "mcp_tool",
      operation: name,
      model: GEMINI_LIVE_MODEL,
      status: result.status === "error" ? "error" : "ok",
      durationMs: Date.now() - startedAt,
      errorMessage: result.status === "error" ? result.message : undefined,
      detail: { toolStatus: result.status },
    });

    return toContent(result);
  });

  return server;
}
