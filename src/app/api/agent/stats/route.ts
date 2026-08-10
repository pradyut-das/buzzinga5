import { NextResponse } from "next/server";
import { getAgentScope } from "@/lib/agent/scope";
import { getDashboardStats } from "@/lib/agent/stats";

export const dynamic = "force-dynamic";

/** Polled by the dashboard so the tiles keep pace with agent-driven changes. */
export async function GET() {
  try {
    const scope = await getAgentScope();
    return NextResponse.json(await getDashboardStats(scope));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the dashboard.";
    const unauthorized = /not signed in/i.test(message);
    return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 500 });
  }
}
