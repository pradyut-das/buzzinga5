import { FunctionCallingConfigMode, GoogleGenAI, type Content, type Part } from "@google/genai";
import { NextResponse } from "next/server";
import { GEMINI_CHAT_MODEL, requireGeminiKey } from "@/lib/agent/gemini";
import { buildSystemInstruction } from "@/lib/agent/prompt";
import { getAgentDirectory, getAgentScope } from "@/lib/agent/scope";
import { getDashboardStats } from "@/lib/agent/stats";
import { ALL_TOOLS, runTool } from "@/lib/agent/tools";

export const dynamic = "force-dynamic";

const MAX_STEPS = 6;
const MAX_HISTORY = 20;

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface ChatToolTrace {
  name: string;
  status: string;
  detail: string;
}

export interface DeskUiAnswer {
  headline: string;
  summary: string;
  facts: {
    label: string;
    value: string;
    detail?: string;
    tone?: "neutral" | "attention" | "critical";
  }[];
  nextActions: { label: string; prompt: string }[];
}

const DESK_UI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "summary", "facts", "nextActions"],
  properties: {
    headline: {
      type: "string",
      description: "A direct, useful answer to the user's question in at most eight words.",
    },
    summary: {
      type: "string",
      description: "One short sentence explaining the answer and what matters.",
    },
    facts: {
      type: "array",
      maxItems: 5,
      description: "Only the few query-specific facts needed to support the answer.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          detail: { type: "string" },
          tone: { type: "string", enum: ["neutral", "attention", "critical"] },
        },
      },
    },
    nextActions: {
      type: "array",
      maxItems: 2,
      description: "Zero to two relevant follow-up questions; never generic or write actions.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "prompt"],
        properties: {
          label: { type: "string" },
          prompt: { type: "string" },
        },
      },
    },
  },
} as const;

const RENDER_DESK_UI_TOOL = {
  name: "render_desk_answer",
  description:
    "Finish a desk question by rendering the smallest useful answer UI. Call only after any necessary read tools have returned, and never call alongside another tool.",
  parametersJsonSchema: DESK_UI_SCHEMA,
} as const;

const DESK_UI_INSTRUCTION = `

DESK ANSWER UI
- After any necessary read tools return, finish by calling render_desk_answer exactly once.
- Never call render_desk_answer alongside another tool and never write a prose response on this surface.
- Generate the smallest useful interface for this exact question, not a generic dashboard.
- Lead with the answer. Include zero to five facts only when they help the user decide or act.
- Fact values may be counts, names, statuses, or short phrases. Never invent a metric.
- Offer at most two specific follow-up questions. Do not offer a write action here.
- Keep every string concise and plain-language. Do not use Markdown.`;

function fallbackDeskUi(text: string): DeskUiAnswer {
  const [headline, ...summary] = text.split(/\n+/).filter(Boolean);
  return {
    headline: headline || "Here is what I found",
    summary: summary.join(" "),
    facts: [],
    nextActions: [],
  };
}

function parseDeskUi(text: string): DeskUiAnswer {
  try {
    const candidate = JSON.parse(text) as Partial<DeskUiAnswer>;
    if (typeof candidate.headline !== "string" || typeof candidate.summary !== "string") {
      return fallbackDeskUi(text);
    }
    return {
      headline: candidate.headline,
      summary: candidate.summary,
      facts: Array.isArray(candidate.facts)
        ? candidate.facts
            .filter(
              (fact) => fact && typeof fact.label === "string" && typeof fact.value === "string",
            )
            .slice(0, 5)
        : [],
      nextActions: Array.isArray(candidate.nextActions)
        ? candidate.nextActions
            .filter(
              (action) =>
                action && typeof action.label === "string" && typeof action.prompt === "string",
            )
            .slice(0, 2)
        : [],
    };
  } catch {
    return fallbackDeskUi(text);
  }
}

/**
 * The text chatbot runs its whole tool loop on the server, unlike the voice
 * session — there is no audio stream to keep open, so the round trip is cheaper
 * and the API key stays put. Both surfaces share ALL_TOOLS and the prompt, so
 * asking by voice and asking by text produce the same answer.
 */
export async function POST(request: Request) {
  let body: { message?: string; history?: ChatTurn[]; responseMode?: "desk" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Say something first." }, { status: 400 });

  try {
    const scope = await getAgentScope();
    const [directory, stats] = await Promise.all([
      getAgentDirectory(scope),
      getDashboardStats(scope),
    ]);

    const ai = new GoogleGenAI({ apiKey: requireGeminiKey() });
    const history: Content[] = (body.history ?? [])
      .slice(-MAX_HISTORY)
      .filter((turn) => turn.text?.trim())
      .map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));

    const contents: Content[] = [...history, { role: "user", parts: [{ text: message }] }];
    const trace: ChatToolTrace[] = [];
    const deskMode = body.responseMode === "desk";

    for (let step = 0; step < MAX_STEPS; step += 1) {
      const response = await ai.models.generateContent({
        model: GEMINI_CHAT_MODEL,
        contents,
        config: {
          systemInstruction:
            buildSystemInstruction(directory, stats, "chat") +
            (deskMode ? DESK_UI_INSTRUCTION : ""),
          tools: [
            {
              functionDeclarations: deskMode ? [...ALL_TOOLS, RENDER_DESK_UI_TOOL] : ALL_TOOLS,
            },
          ],
          ...(deskMode
            ? {
                toolConfig: {
                  functionCallingConfig: {
                    mode: FunctionCallingConfigMode.ANY,
                    // One read round keeps the generated surface both current
                    // and fast; after that, the model must render the answer.
                    ...(trace.length ? { allowedFunctionNames: [RENDER_DESK_UI_TOOL.name] } : {}),
                  },
                },
              }
            : {}),
        },
      });

      const calls = response.functionCalls ?? [];
      const renderCall = deskMode
        ? calls.find((call) => call.name === RENDER_DESK_UI_TOOL.name)
        : undefined;
      const executableCalls = renderCall
        ? calls.filter((call) => call.name !== RENDER_DESK_UI_TOOL.name)
        : calls;
      if (renderCall && executableCalls.length === 0) {
        const ui = parseDeskUi(JSON.stringify(renderCall.args ?? {}));
        return NextResponse.json({ reply: `${ui.headline}\n${ui.summary}`.trim(), ui, trace });
      }
      if (!executableCalls.length) {
        const text = response.text?.trim();
        if (deskMode && text)
          return NextResponse.json({ reply: text, ui: fallbackDeskUi(text), trace });
        return NextResponse.json({
          reply: text || "I could not put that into words. Try asking a different way.",
          trace,
        });
      }

      contents.push({
        role: "model",
        parts: executableCalls.map((call) => ({
          functionCall: { name: call.name, args: call.args },
        })) as Part[],
      });

      const responses: Part[] = [];
      for (const call of executableCalls) {
        const result = await runTool(
          scope,
          call.name ?? "",
          (call.args ?? {}) as Record<string, unknown>,
        );
        trace.push({
          name: call.name ?? "unknown",
          status: result.status,
          detail:
            result.status === "confirmation_required"
              ? result.summary
              : result.status === "executed"
                ? result.summary
                : result.status === "error"
                  ? result.message
                  : "read",
        });
        responses.push({
          functionResponse: {
            name: call.name,
            response: result as unknown as Record<string, unknown>,
          },
        });
      }
      contents.push({ role: "user", parts: responses });
    }

    return NextResponse.json({
      reply: "That took too many steps. Try narrowing the request.",
      trace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The chat agent failed.";
    console.error("[agent] chat failed:", message);
    const unauthorized = /not signed in/i.test(message);
    return NextResponse.json(
      { error: unauthorized ? "Sign in again to use the agent." : message },
      { status: unauthorized ? 401 : 500 },
    );
  }
}
