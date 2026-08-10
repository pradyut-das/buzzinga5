import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { communities, integrationSyncs, topics } from "@/db/schema";
import { env } from "@/lib/validate-env";

/**
 * WhatsApp communities and Instagram research both come from unofficial
 * third-party services, so neither is hard-wired here. Each provider is an
 * HTTP endpoint named by env; the shapes below are what this app expects back.
 * With no endpoint configured the sync is a no-op that records "not
 * configured" — the screens then say so instead of inventing numbers.
 *
 *   WHATSAPP_API_URL / WHATSAPP_API_KEY   → GET {url}/groups
 *   INSTAGRAM_API_URL / INSTAGRAM_API_KEY → GET {url}/trending?q=<niche>
 */

export interface WhatsAppGroup {
  id: string;
  name: string;
  memberCount: number;
  needsReply?: number;
  lastBroadcastAt?: string | null;
  trendPct?: number;
}

export interface InstagramSignal {
  title: string;
  evidence?: string;
  momentumPct?: number;
  novelty?: number;
  url?: string;
}

async function getJson<T>(url: string, key?: string): Promise<T> {
  const response = await fetch(url, {
    headers: key ? { Authorization: `Bearer ${key}`, "x-api-key": key } : {},
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

async function recordSync(provider: string, status: string, detail: string) {
  const existing = await db.query.integrationSyncs.findFirst({
    where: eq(integrationSyncs.provider, provider),
  });
  const row = { provider, status, detail, lastSyncAt: new Date() };
  if (existing) {
    await db.update(integrationSyncs).set(row).where(eq(integrationSyncs.provider, provider));
  } else {
    await db.insert(integrationSyncs).values(row);
  }
}

export async function syncWhatsApp(): Promise<{ synced: number; status: string }> {
  const base = env.WHATSAPP_API_URL;
  if (!base) {
    await recordSync("whatsapp", "not_configured", "Set WHATSAPP_API_URL to sync groups");
    return { synced: 0, status: "not_configured" };
  }

  try {
    const groups = await getJson<WhatsAppGroup[]>(`${base}/groups`, env.WHATSAPP_API_KEY);
    const existing = await db.select().from(communities);

    for (const group of groups) {
      const match = existing.find((row) => row.externalId === group.id);
      const values = {
        name: group.name,
        memberCount: group.memberCount ?? 0,
        needsReply: group.needsReply ?? 0,
        trendPct: group.trendPct ?? 0,
        lastBroadcastAt: group.lastBroadcastAt ? new Date(group.lastBroadcastAt) : null,
        syncedAt: new Date(),
      };
      if (match) {
        await db.update(communities).set(values).where(eq(communities.id, match.id));
      } else {
        await db
          .insert(communities)
          .values({ id: randomUUID(), externalId: group.id, platform: "whatsapp", ...values });
      }
    }

    await recordSync("whatsapp", "ok", `${groups.length} groups`);
    return { synced: groups.length, status: "ok" };
  } catch (error) {
    await recordSync("whatsapp", "error", String(error));
    return { synced: 0, status: "error" };
  }
}

export async function syncInstagram(
  niches: { clientId: string; niche: string }[],
): Promise<{ synced: number; status: string }> {
  const base = env.INSTAGRAM_API_URL;
  if (!base) {
    await recordSync("instagram", "not_configured", "Set INSTAGRAM_API_URL to pull signals");
    return { synced: 0, status: "not_configured" };
  }

  try {
    let count = 0;
    for (const { clientId, niche } of niches) {
      const signals = await getJson<InstagramSignal[]>(
        `${base}/trending?q=${encodeURIComponent(niche)}`,
        env.INSTAGRAM_API_KEY,
      );
      for (const [index, signal] of signals.entries()) {
        await db.insert(topics).values({
          id: randomUUID(),
          clientId,
          title: signal.title,
          evidence: signal.evidence ?? null,
          momentumPct: signal.momentumPct ?? 0,
          novelty: signal.novelty ?? 50,
          state: (signal.momentumPct ?? 0) > 50 ? "act_now" : "watch",
          source: "instagram",
          sourceUrl: signal.url ?? null,
          // Momentum drives distance from the centre; index spreads the angle.
          radarX: Math.round(50 + Math.cos(index) * Math.min(40, (signal.momentumPct ?? 20) / 2)),
          radarY: Math.round(50 + Math.sin(index) * Math.min(40, (signal.momentumPct ?? 20) / 2)),
        });
        count += 1;
      }
    }

    await recordSync("instagram", "ok", `${count} signals`);
    return { synced: count, status: "ok" };
  } catch (error) {
    await recordSync("instagram", "error", String(error));
    return { synced: 0, status: "error" };
  }
}
