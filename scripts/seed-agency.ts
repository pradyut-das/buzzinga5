/**
 * Seeds the demo content agency the v2 screens were designed against:
 * four clients, their content boards, assets, WhatsApp communities, Instagram
 * topic signals, caption drafts and a publishing week.
 *
 * Safe to re-run: it clears the agency tables first, then rebuilds them. The
 * founder account is upserted, never duplicated.
 *
 *   SEED_FOUNDER_PASSWORD=... pnpm db:seed
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  approvals,
  assets,
  boardMembers,
  boards,
  broadcasts,
  captionDrafts,
  clients,
  columns,
  comments,
  communities,
  contributors,
  reviewNotes,
  scheduledPosts,
  taskAssignees,
  tasks,
  taskTags,
  tags,
  topics,
  users,
  type AssetKind,
  type ContributorColor,
} from "@/db/schema";
import { hashPassword } from "@/lib/password-hash";

const FOUNDER_EMAIL = process.env.SEED_FOUNDER_EMAIL ?? "founder@example.com";
const FOUNDER_NAME = process.env.SEED_FOUNDER_NAME ?? "Founder";

function requireSeedPassword(): string {
  const password = process.env.SEED_FOUNDER_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_FOUNDER_PASSWORD is required; seed scripts never contain a default password.",
    );
  }
  return password;
}

const FOUNDER_PASSWORD = requireSeedPassword();

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000);
const daysAhead = (days: number, hour = 10) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

const COLUMN_NAMES = ["To do", "In production", "Review", "Done"] as const;

interface SeedClient {
  name: string;
  initials: string;
  color: string;
  voiceGuide: string;
  banned: string[];
  team: { name: string; color: ContributorColor }[];
  tasks: {
    title: string;
    column: number;
    kind: AssetKind;
    quietDays: number;
    tag?: string;
  }[];
}

const CLIENTS: SeedClient[] = [
  {
    name: "Northstar",
    initials: "NA",
    color: "#6bc4ee",
    voiceGuide: "Direct operator voice. Short sentences. No hype, no emoji walls.",
    banned: ["game-changer", "revolutionary"],
    team: [
      { name: "Mira K.", color: "blue" },
      { name: "Arun C.", color: "amber" },
    ],
    tasks: [
      {
        title: "August myth-busters",
        column: 0,
        kind: "carousel",
        quietDays: 1,
        tag: "Social",
      },
      {
        title: "Founder POV: hiring",
        column: 0,
        kind: "video",
        quietDays: 2,
        tag: "High",
      },
      { title: "Community roundup", column: 0, kind: "static", quietDays: 3 },
      {
        title: "4 habits teams need",
        column: 1,
        kind: "carousel",
        quietDays: 1,
        tag: "Social",
      },
      {
        title: "Q3 case-study cut",
        column: 1,
        kind: "video",
        quietDays: 2,
        tag: "High",
      },
      {
        title: "Remote rituals caption",
        column: 2,
        kind: "caption",
        quietDays: 1,
        tag: "Social",
      },
      { title: "The clarity tax", column: 2, kind: "carousel", quietDays: 2 },
      { title: "Monday insight post", column: 3, kind: "static", quietDays: 4 },
      { title: "Culture audit reel", column: 3, kind: "video", quietDays: 5 },
    ],
  },
  {
    name: "Off Menu",
    initials: "OF",
    color: "#ff985e",
    voiceGuide: "Playful food writing. Sensory verbs. Never call anything 'iconic'.",
    banned: ["iconic", "foodgasm"],
    team: [
      { name: "Priya S.", color: "orange" },
      { name: "Dev R.", color: "rose" },
    ],
    tasks: [
      {
        title: "A table worth crossing town for",
        column: 2,
        kind: "caption",
        quietDays: 1,
      },
      {
        title: "Chef's pass reel",
        column: 1,
        kind: "video",
        quietDays: 2,
        tag: "High",
      },
      {
        title: "Weekend specials static",
        column: 0,
        kind: "static",
        quietDays: 1,
      },
      {
        title: "Neighbourhood guide carousel",
        column: 3,
        kind: "carousel",
        quietDays: 6,
      },
    ],
  },
  {
    name: "Luma Skin",
    initials: "LU",
    color: "#c7a6ff",
    voiceGuide: "Warm expert. Cite mechanism, never fear tactics. No before/after promises.",
    banned: ["miracle", "cure", "detox"],
    team: [
      { name: "Mira K.", color: "violet" },
      { name: "Sana T.", color: "pink" },
    ],
    tasks: [
      {
        title: "Barrier repair, explained",
        column: 2,
        kind: "video",
        quietDays: 1,
        tag: "High",
      },
      {
        title: "Skin cycling explainer",
        column: 1,
        kind: "carousel",
        quietDays: 2,
      },
      { title: "SPF under makeup", column: 0, kind: "carousel", quietDays: 3 },
      {
        title: "Retinol recovery week",
        column: 0,
        kind: "static",
        quietDays: 1,
      },
      { title: "Founder Q&A cut", column: 3, kind: "video", quietDays: 7 },
    ],
  },
  {
    name: "Finwise",
    initials: "FI",
    color: "#89d4aa",
    voiceGuide: "Plain-language finance. Always name the assumption. No returns promises.",
    banned: ["guaranteed", "risk-free"],
    team: [{ name: "Arun C.", color: "emerald" }],
    tasks: [
      {
        title: "Founder POV: runway maths",
        column: 1,
        kind: "video",
        quietDays: 1,
        tag: "High",
      },
      { title: "Three tax myths", column: 0, kind: "carousel", quietDays: 4 },
      {
        title: "Quarterly letter recap",
        column: 3,
        kind: "static",
        quietDays: 8,
      },
    ],
  },
];

async function clearAgencyTables() {
  // Child rows first: every FK in this schema is "restrict".
  await db.delete(reviewNotes);
  await db.delete(approvals);
  await db.delete(captionDrafts);
  await db.delete(scheduledPosts);
  await db.delete(assets);
  await db.delete(broadcasts);
  await db.delete(communities);
  await db.delete(topics);
  await db.delete(taskTags);
  await db.delete(taskAssignees);
  await db.delete(comments);
  await db.delete(tasks);
  await db.delete(tags);
  await db.delete(contributors);
  await db.delete(columns);
  await db.delete(boardMembers);
  await db.delete(boards);
  await db.delete(clients);
}

async function upsertFounder(): Promise<string> {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, FOUNDER_EMAIL),
  });
  if (existing) {
    await db
      .update(users)
      .set({ name: FOUNDER_NAME, passwordHash: hashPassword(FOUNDER_PASSWORD) })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: FOUNDER_EMAIL,
    name: FOUNDER_NAME,
    passwordHash: hashPassword(FOUNDER_PASSWORD),
  });
  return id;
}

async function main() {
  console.log("Seeding the agency…");
  const founderId = await upsertFounder();
  await clearAgencyTables();

  const clientIds: Record<string, string> = {};
  const boardIds: Record<string, string> = {};
  const taskIdsByTitle: Record<string, string> = {};
  const contributorIds: Record<string, string> = {};

  for (const [index, seed] of CLIENTS.entries()) {
    const clientId = randomUUID();
    const boardId = randomUUID();
    clientIds[seed.name] = clientId;
    boardIds[seed.name] = boardId;

    await db.insert(clients).values({
      id: clientId,
      name: seed.name,
      initials: seed.initials,
      color: seed.color,
      voiceGuide: seed.voiceGuide,
      bannedPhrases: JSON.stringify(seed.banned),
      nextDeadlineAt: daysAhead(index + 1, 11),
    });

    await db.insert(boards).values({
      id: boardId,
      clientId,
      title: `${seed.name} content board`,
      ownerId: founderId,
    });
    await db.insert(boardMembers).values({ boardId, userId: founderId, role: "owner" });

    const columnIds: string[] = [];
    for (const [position, name] of COLUMN_NAMES.entries()) {
      const id = randomUUID();
      columnIds.push(id);
      await db.insert(columns).values({ id, boardId, name, position });
    }

    for (const member of seed.team) {
      const id = randomUUID();
      contributorIds[`${seed.name}:${member.name}`] = id;
      await db.insert(contributors).values({
        id,
        boardId,
        name: member.name,
        color: member.color,
      });
    }

    const tagIds: Record<string, string> = {};
    for (const [name, color] of [
      ["High", "red"],
      ["Social", "blue"],
    ] as [string, ContributorColor][]) {
      const id = randomUUID();
      tagIds[name] = id;
      await db.insert(tags).values({ id, boardId, name, color });
    }

    for (const [position, task] of seed.tasks.entries()) {
      const id = randomUUID();
      taskIdsByTitle[`${seed.name}:${task.title}`] = id;
      await db.insert(tasks).values({
        id,
        boardId,
        columnId: columnIds[task.column],
        title: task.title,
        priority: task.tag === "High" ? "high" : "none",
        position,
        createdAt: hoursAgo(task.quietDays * 24 + position),
      });

      const owner = seed.team[position % seed.team.length];
      if (owner && task.column !== 0) {
        await db.insert(taskAssignees).values({
          taskId: id,
          contributorId: contributorIds[`${seed.name}:${owner.name}`],
        });
      }
      if (task.tag) {
        await db.insert(taskTags).values({ taskId: id, tagId: tagIds[task.tag] });
      }
    }
  }

  // Assets available to task workspaces and the caption studio.
  const assetSeed: {
    client: string;
    task: string;
    kind: AssetKind;
    title: string;
    accent: string;
    ageHours: number;
    slides?: number;
    seconds?: number;
    body?: string;
  }[] = [
    {
      client: "Northstar",
      task: "4 habits teams need",
      kind: "carousel",
      title: "The 4 habits that make teams move",
      accent: "#245f86",
      ageHours: 2,
      slides: 7,
    },
    {
      client: "Luma Skin",
      task: "Barrier repair, explained",
      kind: "video",
      title: "Barrier repair, explained",
      accent: "#8f466f",
      ageHours: 4,
      seconds: 27,
    },
    {
      client: "Off Menu",
      task: "A table worth crossing town for",
      kind: "caption",
      title: "A table worth crossing town for",
      accent: "#a55323",
      ageHours: 26,
      body:
        "Some tables are worth the detour. Ours takes 40 minutes to reach and about " +
        "four seconds to justify. Book Thursday — the pass menu changes at seven.",
    },
    {
      client: "Northstar",
      task: "Remote rituals caption",
      kind: "caption",
      title: "“Can we make this less technical?”",
      accent: "#326f72",
      ageHours: 0.5,
      body: "Remote work doesn’t fail from distance. It fails from ambiguity.",
    },
    {
      client: "Luma Skin",
      task: "Skin cycling explainer",
      kind: "carousel",
      title: "Skin cycling, without the fatigue",
      accent: "#65378f",
      ageHours: 12,
      slides: 6,
    },
    {
      client: "Finwise",
      task: "Founder POV: runway maths",
      kind: "video",
      title: "Runway maths, in ninety seconds",
      accent: "#2f6b45",
      ageHours: 9,
      seconds: 92,
    },
  ];

  let firstAssetId = "";
  for (const item of assetSeed) {
    const assetId = randomUUID();
    firstAssetId ||= assetId;
    await db.insert(assets).values({
      id: assetId,
      clientId: clientIds[item.client],
      taskId: taskIdsByTitle[`${item.client}:${item.task}`] ?? null,
      kind: item.kind,
      title: item.title,
      accent: item.accent,
      slideCount: item.slides ?? null,
      durationSeconds: item.seconds ?? null,
      body: item.body ?? null,
      createdAt: hoursAgo(item.ageHours),
    });
  }

  await db.insert(reviewNotes).values([
    {
      id: randomUUID(),
      approvalId: null,
      assetId: firstAssetId,
      slideIndex: 5,
      author: "Squirrl",
      source: "agent",
      body: "Slide 5 makes one claim the source pack does not support.",
      createdAt: hoursAgo(3),
    },
    {
      id: randomUUID(),
      approvalId: null,
      assetId: firstAssetId,
      author: "Mira K.",
      source: "agency",
      body: "New cut uploaded with a softer opening.",
      createdAt: hoursAgo(1),
    },
    {
      id: randomUUID(),
      approvalId: null,
      assetId: firstAssetId,
      author: "Client",
      source: "client",
      body: "Keep the science, make it warmer.",
      createdAt: hoursAgo(30),
    },
  ]);

  // WhatsApp communities and the next broadcast.
  const communitySeed: [string, string | null, number, number, number, number][] = [
    ["Northstar Leaders", "Northstar", 1284, 12, 18, 30],
    ["Luma Skin Circle", "Luma Skin", 836, 4, 7, 54],
    ["Off Menu Insiders", "Off Menu", 2104, 0, 24, 96],
    ["Finwise Founders", "Finwise", 647, 3, -3, 144],
    ["Design Sundays", null, 392, 0, 5, 12],
  ];

  let lumaCommunityId = "";
  for (const [name, client, members, needsReply, trend, broadcastHoursAgo] of communitySeed) {
    const id = randomUUID();
    if (name === "Luma Skin Circle") lumaCommunityId = id;
    await db.insert(communities).values({
      id,
      clientId: client ? clientIds[client] : null,
      name,
      memberCount: members,
      needsReply,
      trendPct: trend,
      lastBroadcastAt: hoursAgo(broadcastHoursAgo),
      syncedAt: new Date(),
    });
  }

  await db.insert(broadcasts).values({
    id: randomUUID(),
    communityId: lumaCommunityId,
    body: "We asked Dr. Mehta your top barrier-repair questions. Here are the 5 answers…",
    audience: "all",
    scheduledAt: daysAhead(0, 18),
    state: "scheduled",
    scheduledBy: "Mira K.",
  });

  // Instagram topic radar.
  const topicSeed: [string, string, string, number, number, string, number, number][] = [
    [
      "Luma Skin",
      "Skin cycling fatigue",
      "3 competitors rising · strong contrarian hook",
      84,
      78,
      "act_now",
      12,
      26,
    ],
    [
      "Luma Skin",
      "Barrier-first routines",
      "Saved-hook pattern · low production effort",
      51,
      64,
      "act_now",
      78,
      18,
    ],
    [
      "Luma Skin",
      "Mineral SPF myths",
      "High search, no Luma post in 90 days",
      33,
      88,
      "watch",
      42,
      74,
    ],
    ["Luma Skin", "Derm reactions", "Community question repeated 14×", 29, 55, "watch", 70, 62],
    [
      "Northstar",
      "Hiring slowdowns",
      "Founder commentary spiking this week",
      47,
      71,
      "watch",
      30,
      40,
    ],
    [
      "Off Menu",
      "Chef's-pass content",
      "Competitor reels averaging 3× saves",
      62,
      66,
      "act_now",
      55,
      35,
    ],
  ];

  for (const [client, title, evidence, momentum, novelty, state, x, y] of topicSeed) {
    await db.insert(topics).values({
      id: randomUUID(),
      clientId: clientIds[client],
      title,
      evidence,
      momentumPct: momentum,
      novelty,
      state: state as "act_now" | "watch",
      source: "instagram",
      radarX: x,
      radarY: y,
      capturedAt: hoursAgo(6),
    });
  }

  // A caption studio run, left mid-flight so the studio has something to show.
  await db.insert(captionDrafts).values({
    id: randomUUID(),
    clientId: clientIds["Luma Skin"],
    taskId: taskIdsByTitle["Luma Skin:Barrier repair, explained"],
    goal: "Drive saves + thoughtful replies",
    voice: "Warm expert · no fear tactics",
    variants: JSON.stringify([
      {
        label: "Recommended",
        brandVoicePct: 92,
        body: "Your skin barrier isn’t “damaged” because you did skincare wrong. It may just be asking for less. Here’s how to read the signs…",
      },
      {
        label: "Founder voice",
        brandVoicePct: 86,
        body: "The best barrier routine is often the one with fewer steps. Save this before your next reset week…",
      },
      {
        label: "Conversation",
        brandVoicePct: 81,
        body: "What did your skin wish you stopped doing sooner? We’ll go first: over-exfoliating.",
      },
    ]),
    selectedIndex: 0,
    checks: JSON.stringify({
      brandVoice: true,
      claimSafety: true,
      platformLength: true,
      bannedPhrases: true,
    }),
  });

  // The publishing week behind the cross-client calendar.
  const week: [string, string, string, number, number][] = [
    ["Luma Skin", "Barrier repair carousel", "instagram", 0, 10],
    ["Northstar", "Clarity tax post", "linkedin", 0, 16],
    ["Off Menu", "Chef's pass reel", "instagram", 1, 19],
    ["Northstar", "4 habits carousel", "instagram", 2, 11],
    ["Finwise", "Founder POV: runway", "linkedin", 3, 9],
    ["Luma Skin", "Skin cycling reel", "instagram", 4, 18],
    ["Off Menu", "Weekend specials", "instagram", 4, 20],
    ["Off Menu", "Stories: pass menu", "instagram", 5, 12],
  ];

  for (const [client, title, platform, dayOffset, hour] of week) {
    await db.insert(scheduledPosts).values({
      id: randomUUID(),
      clientId: clientIds[client],
      platform,
      title,
      scheduledAt: daysAhead(dayOffset, hour),
      state: dayOffset === 0 ? "scheduled" : "planned",
    });
  }

  console.log(
    `Seeded ${CLIENTS.length} clients, ${assetSeed.length} assets, and a publishing week.`,
  );
  console.log(`Founder login: ${FOUNDER_EMAIL}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
