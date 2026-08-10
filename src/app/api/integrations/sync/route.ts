import { NextResponse } from "next/server";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { syncInstagram, syncWhatsApp } from "@/lib/integrations/providers";

/** Pulls both third-party feeds. Called from the Communities and Radar screens. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { provider } = (await request.json().catch(() => ({}))) as { provider?: string };

  if (provider === "whatsapp") {
    return NextResponse.json(await syncWhatsApp());
  }

  if (provider === "instagram") {
    const rows = await db.select().from(clients);
    return NextResponse.json(
      await syncInstagram(
        rows.map((row) => ({ clientId: row.id, niche: row.cadence ?? row.name })),
      ),
    );
  }

  const [whatsapp, instagram] = await Promise.all([
    syncWhatsApp(),
    db
      .select()
      .from(clients)
      .then((rows) =>
        syncInstagram(rows.map((row) => ({ clientId: row.id, niche: row.cadence ?? row.name }))),
      ),
  ]);
  return NextResponse.json({ whatsapp, instagram });
}
