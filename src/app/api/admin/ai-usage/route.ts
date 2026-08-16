import { NextResponse } from "next/server";
import { getAiUsageReport } from "@/lib/ai/report";
import { getCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

/**
 * The usage report as JSON, for exporting into a spreadsheet or an external
 * dashboard. Admin-only and read-only: nothing here can change a cap, because
 * caps live in the environment where a compromised session cannot reach them.
 */
export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const days = Number(new URL(request.url).searchParams.get("days"));
  const window = Number.isFinite(days) && days > 0 && days <= 365 ? Math.floor(days) : 30;

  return NextResponse.json(await getAiUsageReport(window));
}
