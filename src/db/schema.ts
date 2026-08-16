import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============================================================
// TABLE DEFINITIONS
// ============================================================

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// Users - account holders (see ADR security__user-accounts).
//
// A mirror of Supabase Auth, keyed by the Supabase user id. Supabase owns
// credentials and sessions; this table exists so boards, memberships and
// approvals have a local row to foreign-key against.
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Supabase auth user id (UUID)
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  // Retained from the pre-Supabase login. Never read — Supabase verifies
  // credentials now — and null for every account created since the switch.
  passwordHash: text("password_hash"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Clients - the agency's roster. Every board belongs to one client, and the
// client rail in the app shell is a list of these.
export const CLIENT_HEALTH = ["good", "watch", "risk"] as const;
export type ClientHealth = (typeof CLIENT_HEALTH)[number];

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(), // UUID
  name: text("name").notNull(),
  /** Two letters for the rail avatar. */
  initials: text("initials").notNull(),
  /** Hex used for the avatar and calendar event colour. */
  color: text("color").notNull().default("#d8b4fe"),
  /** Account manager(s) inside the agency who own this client. */
  contact: text("contact"),
  /** The delivery promise, e.g. "1 reel everyday and 1 carousel in 3 days". */
  cadence: text("cadence"),
  /** Brand voice, banned phrases and claim rules the caption studio reads. */
  voiceGuide: text("voice_guide"),
  bannedPhrases: text("banned_phrases"), // JSON array
  nextDeadlineAt: integer("next_deadline_at", { mode: "timestamp" }),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Boards - identified by UUID, one content board per client
export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "restrict",
  }),
  title: text("title").notNull().default("New board"),
  /** Null unless the board is shared outside the agency behind a password. */
  passwordHash: text("password_hash"),
  // Nullable: boards created before user accounts existed have no owner
  ownerId: text("owner_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Board members - which boards a signed-in user sees in the sidebar
export const BOARD_MEMBER_ROLES = ["owner", "member"] as const;
export type BoardMemberRole = (typeof BOARD_MEMBER_ROLES)[number];

export const boardMembers = sqliteTable(
  "board_members",
  {
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member").$type<BoardMemberRole>(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.boardId, t.userId] })],
);

// Columns - belong to a board, orderable
export const columns = sqliteTable("columns", {
  id: text("id").primaryKey(), // UUID
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  isCollapsed: integer("is_collapsed", { mode: "boolean" }).default(false),
});

// Task categories - the board's own vocabulary for what a task is. There are
// no built-in kinds: every category is created by someone, so a board only
// carries the words its work actually uses.
export const taskCategories = sqliteTable("task_categories", {
  id: text("id").primaryKey(), // UUID
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  /** Hex accent used on the card chip. */
  color: text("color").notNull().default("#d8b4fe"),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Status is free-form on purpose: any category can sit in any state, and there is
// no enforced order between them.
export const TASK_STATUSES = [
  "todo",
  "review",
  "accepted",
  "rejected",
  "in_production",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Tasks - belong to a board and column
export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(), // UUID
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  columnId: text("column_id")
    .notNull()
    .references(() => columns.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  status: text("status").notNull().default("todo").$type<TaskStatus>(),
  /** The client this task is for. Defaults to the board's client. */
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  /** The board category this task was filed under. Null means uncategorized. */
  categoryId: text("category_id").references(() => taskCategories.id, {
    onDelete: "set null",
  }),
  /** TipTap JSON: the task's writing. */
  doc: text("doc"),
  priority: text("priority").notNull().default("none").$type<TaskPriority>(),
  /** Optional deadline. Null means the column order is the only schedule. */
  dueAt: integer("due_at", { mode: "timestamp" }),
  position: integer("position").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Predefined color palette for contributors
export const CONTRIBUTOR_COLORS = [
  "rose",
  "pink",
  "fuchsia",
  "purple",
  "violet",
  "indigo",
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "green",
  "lime",
  "yellow",
  "amber",
  "orange",
  "red",
] as const;

export type ContributorColor = (typeof CONTRIBUTOR_COLORS)[number];

// Contributors - belong to a board
export const contributors = sqliteTable("contributors", {
  id: text("id").primaryKey(), // UUID
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  email: text("email"), // Optional - for email notifications
  color: text("color").notNull().$type<ContributorColor>(),
  /**
   * The real account this contributor stands for. People pickers list users and
   * find-or-create the contributor behind the choice, so a board's people are
   * accounts rather than typed-in names. Null on rows that predate the link.
   */
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  /**
   * Set when this person opts out of notification email. Kept as a timestamp
   * rather than a flag so we can tell when they left, and clearing the column
   * is all it takes to re-subscribe.
   */
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp" }),
  /**
   * Bearer secret for the unsubscribe link. The token is the only credential —
   * the link has to work from an inbox, without a session. Minted lazily the
   * first time a digest is addressed to this person.
   */
  unsubscribeToken: text("unsubscribe_token").unique(),
});

// Task assignees - many-to-many
// Note: Using "restrict" to force intentional deletion of assignments before removing tasks/contributors
export const taskAssignees = sqliteTable(
  "task_assignees",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.contributorId] })],
);

// Task collaborators - many-to-many. The assignee owns the task; collaborators
// work on it alongside them.
export const taskCollaborators = sqliteTable(
  "task_collaborators",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.contributorId] })],
);

// Task stakeholders - many-to-many (reuses contributors)
// Note: Using "restrict" to force intentional deletion of stakeholder relationships before removing tasks/contributors
export const taskStakeholders = sqliteTable(
  "task_stakeholders",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    contributorId: text("contributor_id")
      .notNull()
      .references(() => contributors.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.contributorId] })],
);

// Tags - belong to a board
export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(), // UUID
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  color: text("color").notNull().$type<ContributorColor>(),
});

// Task tags - many-to-many
// Note: Using "restrict" to force intentional deletion of tag assignments before removing tasks/tags
export const taskTags = sqliteTable(
  "task_tags",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "restrict" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.tagId] })],
);

// Comments - belong to a task and have an author (contributor) and optional stakeholder
export const comments = sqliteTable("comments", {
  id: text("id").primaryKey(), // UUID
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "restrict" }),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  authorId: text("author_id")
    .notNull()
    .references(() => contributors.id, { onDelete: "restrict" }),
  stakeholderId: text("stakeholder_id").references(() => contributors.id, {
    onDelete: "restrict",
  }),
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Pending notifications - queue for batching email notifications
export const NOTIFICATION_TYPES = [
  "created",
  "comment",
  "move",
  "assign",
  "priority",
  "mention",
  "status",
  "doc",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const pendingNotifications = sqliteTable("pending_notifications", {
  id: text("id").primaryKey(), // UUID
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "restrict" }),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => contributors.id, { onDelete: "cascade" }),
  type: text("type").notNull().$type<NotificationType>(),
  triggeredById: text("triggered_by_id").references(() => contributors.id, {
    onDelete: "set null",
  }),
  metadata: text("metadata"), // JSON: column names, comment preview, etc.
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Sent emails - "Letter Opener" style email log for debugging and testing
// Always populated in all environments; production also sends via Resend
export const sentEmails = sqliteTable("sent_emails", {
  id: text("id").primaryKey(), // UUID
  fromEmail: text("from_email").notNull().default("notifications@resend.dev"),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name").notNull(),
  subject: text("subject").notNull(),
  boardId: text("board_id").notNull(),
  boardTitle: text("board_title").notNull(),
  htmlContent: text("html_content").notNull(), // Rendered HTML for viewing
  notificationIds: text("notification_ids").notNull(), // JSON array of notification IDs
  sentToResend: integer("sent_to_resend", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// ============================================================
// V2 — AGENCY OPERATIONS
// ============================================================

// Assets - the thing being produced: a carousel, a video cut, a static post,
// a caption draft, or a story. Files live in Vercel Blob; rows point at them.
export const ASSET_KINDS = ["carousel", "video", "static", "caption", "story", "clip"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

// Review verdict carried by a whole asset (a video cut, a generated slide set)
// and by each slide inside a carousel.
export const MEDIA_STATES = ["pending", "accepted", "rejected"] as const;
export type MediaState = (typeof MEDIA_STATES)[number];

/** One carousel slide, as stored in `assets.slides`. */
export interface AssetSlide {
  url: string;
  text: string;
  generated: boolean;
  state?: MediaState;
}

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  /** The task that produced it, when the asset came off a board. */
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  kind: text("kind").notNull().$type<AssetKind>(),
  title: text("title").notNull(),
  /** Vercel Blob URL of the asset itself; null for caption-only assets. */
  blobUrl: text("blob_url"),
  thumbnailUrl: text("thumbnail_url"),
  /** Solid accent color used when there is no thumbnail, so the UI is never blank. */
  accent: text("accent"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes"),
  /** Carousels count slides; videos count seconds. */
  slideCount: integer("slide_count"),
  /** Carousel slides: JSON [{url, text, generated}] in running order. */
  slides: text("slides"),
  durationSeconds: integer("duration_seconds"),
  version: integer("version").notNull().default(1),
  /** The asset this one supersedes, for version comparison. */
  supersedesId: text("supersedes_id"),
  /** Accept/reject verdict for the whole asset. */
  state: text("state").notNull().default("pending").$type<MediaState>(),
  body: text("body"), // caption/script copy
  /** Shoot clips: the Whisper transcript the semantic rename was derived from. */
  transcript: text("transcript"),
  /** Shoot clips: the name the model proposed, kept until someone applies it. */
  suggestedTitle: text("suggested_title"),
  /** Original filename, so a renamed clip can still be traced to the card. */
  originalName: text("original_name"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Approvals - the founder's queue. One row per decision requested.
export const APPROVAL_STATES = ["pending", "approved", "changes_requested", "expired"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(), // UUID
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id, { onDelete: "restrict" }),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  state: text("state").notNull().default("pending").$type<ApprovalState>(),
  /** Why it matters, shown on the orbiting card. */
  reason: text("reason"),
  dueAt: integer("due_at", { mode: "timestamp" }),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
  decidedById: text("decided_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  decisionNote: text("decision_note"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Review notes - feedback pinned to a slide or a video timestamp.
//
// A note now hangs off the asset directly, so slide and frame feedback works
// on a task that was never sent for client approval. `approvalId` stays for
// notes raised inside an approval, and is null otherwise.
export const reviewNotes = sqliteTable("review_notes", {
  id: text("id").primaryKey(), // UUID
  approvalId: text("approval_id").references(() => approvals.id, {
    onDelete: "restrict",
  }),
  assetId: text("asset_id").references(() => assets.id, {
    onDelete: "restrict",
  }),
  /** Freehand drawing over the frame: JSON [{points:[[x,y]…], color}] in 0-1 space. */
  annotation: text("annotation"),
  /** Resolved notes stay visible but drop out of the open count. */
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  /** Slide index for carousels, seconds for video, null for whole-asset notes. */
  slideIndex: integer("slide_index"),
  timestampSeconds: integer("timestamp_seconds"),
  author: text("author").notNull(),
  /** "agent" notes are the brand/claim check, "client" notes came from outside. */
  source: text("source").notNull().default("agency"),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Communities - WhatsApp groups the agency runs, synced from an unofficial API.
export const communities = sqliteTable("communities", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  platform: text("platform").notNull().default("whatsapp"),
  /** Provider-side id, so a re-sync updates instead of duplicating. */
  externalId: text("external_id"),
  memberCount: integer("member_count").notNull().default(0),
  needsReply: integer("needs_reply").notNull().default(0),
  lastBroadcastAt: integer("last_broadcast_at", { mode: "timestamp" }),
  /** Percentage change in activity over the sync window. */
  trendPct: integer("trend_pct").notNull().default(0),
  syncedAt: integer("synced_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const BROADCAST_STATES = ["draft", "scheduled", "sending", "sent", "failed"] as const;
export type BroadcastState = (typeof BROADCAST_STATES)[number];

export const broadcasts = sqliteTable("broadcasts", {
  id: text("id").primaryKey(), // UUID
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  audience: text("audience").notNull().default("all"),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
  sentAt: integer("sent_at", { mode: "timestamp" }),
  state: text("state").notNull().default("draft").$type<BroadcastState>(),
  scheduledBy: text("scheduled_by"),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Topics - Instagram research signals, pulled from an unofficial source.
export const TOPIC_STATES = ["act_now", "watch", "briefed", "dismissed"] as const;
export type TopicState = (typeof TOPIC_STATES)[number];

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  /** Why it is moving, in one line. */
  evidence: text("evidence"),
  momentumPct: integer("momentum_pct").notNull().default(0),
  /** 0-100: how little the client has covered this already. */
  novelty: integer("novelty").notNull().default(50),
  state: text("state").notNull().default("watch").$type<TopicState>(),
  source: text("source"),
  sourceUrl: text("source_url"),
  /** Radar placement, so the map is stable between renders. */
  radarX: integer("radar_x"),
  radarY: integer("radar_y"),
  briefTaskId: text("brief_task_id").references(() => tasks.id, {
    onDelete: "set null",
  }),
  capturedAt: integer("captured_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Caption studio - one row per generation run, variants stored as JSON.
export const captionDrafts = sqliteTable("caption_drafts", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  assetId: text("asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  goal: text("goal"),
  voice: text("voice"),
  variants: text("variants").notNull(), // JSON [{label, body, brandVoicePct}]
  selectedIndex: integer("selected_index"),
  finalBody: text("final_body"),
  checks: text("checks"), // JSON {brandVoice, claimSafety, length, bannedPhrases}
  attachedAt: integer("attached_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Scheduled posts - the cross-client calendar and the publishing queue.
export const POST_STATES = [
  "planned",
  "ready",
  "scheduled",
  "publishing",
  "published",
  "failed",
] as const;
export type PostState = (typeof POST_STATES)[number];

export const scheduledPosts = sqliteTable("scheduled_posts", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  assetId: text("asset_id").references(() => assets.id, {
    onDelete: "set null",
  }),
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  platform: text("platform").notNull().default("instagram"),
  title: text("title").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }).notNull(),
  state: text("state").notNull().default("planned").$type<PostState>(),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Integration syncs - one row per provider, so the UI can say "stale" honestly.
export const integrationSyncs = sqliteTable("integration_syncs", {
  provider: text("provider").primaryKey(), // "whatsapp" | "instagram"
  status: text("status").notNull().default("never"), // never | ok | error
  lastSyncAt: integer("last_sync_at", { mode: "timestamp" }),
  detail: text("detail"),
});

// AI usage ledger (see ADR global__ai-usage-metering).
//
// One immutable row per model call. Nothing updates or deletes these rows:
// when spend looks wrong, this table is the source of truth for what was
// actually asked of the provider, by whom, and what it cost. A call that
// fails or is refused by the rate limiter is recorded too — a missing row
// would make a broken key look identical to an idle day.
export const AI_SURFACES = [
  "chat",
  "voice",
  "voice_tool",
  "mcp_tool",
  "embedding",
  "unknown",
] as const;
export type AiSurface = (typeof AI_SURFACES)[number];

export const AI_CALL_STATUSES = ["ok", "error", "blocked"] as const;
export type AiCallStatus = (typeof AI_CALL_STATUSES)[number];

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    // Kept as plain columns rather than foreign keys: the ledger has to
    // survive the deletion of the user or board it refers to, or an account
    // deletion would erase the evidence of what that account spent.
    userId: text("user_id"),
    userEmail: text("user_email"),
    surface: text("surface").notNull(), // AI_SURFACES
    operation: text("operation").notNull(), // generateContent | embedContent | liveSession | ...
    model: text("model").notNull(),
    status: text("status").notNull(), // AI_CALL_STATUSES
    promptTokens: integer("prompt_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    thoughtTokens: integer("thought_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    // Micro-USD (millionths) so cost stays an exact integer. Floats would
    // drift over a month of accumulation and make a bill impossible to tie out.
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    // True when the provider reported no usage and the cost is derived from
    // an estimate (Live audio minutes), so a report never presents a guess
    // as a measurement.
    estimated: integer("estimated", { mode: "boolean" }).notNull().default(false),
    durationMs: integer("duration_ms").notNull().default(0),
    // Populated on status "error" and "blocked" — the reason the spend did
    // not happen is as important as the spend itself.
    errorMessage: text("error_message"),
    // The limit that refused the call, e.g. "user_day_usd".
    blockedBy: text("blocked_by"),
    /** Free-form JSON: tool names, step index, request id. Never PII-bearing content. */
    detail: text("detail"),
  },
  (table) => [
    index("ai_usage_created_idx").on(table.createdAt),
    index("ai_usage_user_created_idx").on(table.userId, table.createdAt),
    index("ai_usage_surface_created_idx").on(table.surface, table.createdAt),
  ],
);

// Voice sessions that were granted a token and charged up front.
//
// The up-front charge and the refund that settles it happen in two separate
// requests, so the reservation has to outlive the first one: without a stored
// row, the settlement endpoint has no way to tell a real session from an id a
// client invented, and every refund is credit minted from nothing.
//
// The row is what makes the refund safe. It records who was charged and how
// much, so a settlement can only ever be claimed by its owner and can only
// ever give back what this session actually paid.
export const aiVoiceSessions = sqliteTable(
  "ai_voice_sessions",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    /** Who was charged. A settlement from anyone else is refused. */
    userId: text("user_id").notNull(),
    /** Micro-USD charged up front; the refund is clamped to this. */
    chargedMicroUsd: integer("charged_micro_usd").notNull(),
    /** Set once settled, so a replayed settlement refunds nothing. */
    settledAt: integer("settled_at", { mode: "timestamp" }),
  },
  (table) => [index("ai_voice_sessions_user_idx").on(table.userId)],
);

// Rolling rate-limit counters, one row per (subject, window bucket).
//
// Separate from the ledger on purpose: a limit check runs before every model
// call, and aggregating the whole ledger to answer it would get slower exactly
// as usage grows. Each row is a single indexed primary-key read.
export const aiUsageCounters = sqliteTable(
  "ai_usage_counters",
  {
    /** "user:<id>", or "global" for the agency-wide caps. */
    subject: text("subject").notNull(),
    /** minute | day */
    window: text("window").notNull(),
    /** Unix seconds at the start of the bucket. */
    bucketStart: integer("bucket_start").notNull(),
    calls: integer("calls").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.subject, table.window, table.bucketStart] }),
    index("ai_usage_counters_bucket_idx").on(table.bucketStart),
  ],
);

// Rolling counters capping how much notification email one person can be sent.
//
// Same shape and reasoning as ai_usage_counters: a cap is checked before every
// send, and a single primary-key read answers it no matter how much mail has
// gone out historically.
export const emailSendCounters = sqliteTable(
  "email_send_counters",
  {
    /** The contributor being written to, as "contributor:<id>". */
    subject: text("subject").notNull(),
    /** hour | day */
    window: text("window").notNull(),
    /** Unix seconds at the start of the bucket. */
    bucketStart: integer("bucket_start").notNull(),
    emails: integer("emails").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.subject, table.window, table.bucketStart] }),
    index("email_send_counters_bucket_idx").on(table.bucketStart),
  ],
);

// ============================================================
// RELATIONS
// ============================================================

export const usersRelations = relations(users, ({ many }) => ({
  ownedBoards: many(boards),
  memberships: many(boardMembers),
}));

export const boardMembersRelations = relations(boardMembers, ({ one }) => ({
  board: one(boards, {
    fields: [boardMembers.boardId],
    references: [boards.id],
  }),
  user: one(users, {
    fields: [boardMembers.userId],
    references: [users.id],
  }),
}));

export const boardsRelations = relations(boards, ({ one, many }) => ({
  client: one(clients, {
    fields: [boards.clientId],
    references: [clients.id],
  }),
  owner: one(users, {
    fields: [boards.ownerId],
    references: [users.id],
  }),
  members: many(boardMembers),
  columns: many(columns),
  tasks: many(tasks),
  taskCategories: many(taskCategories),
  contributors: many(contributors),
  tags: many(tags),
  comments: many(comments),
  pendingNotifications: many(pendingNotifications),
}));

export const taskCategoriesRelations = relations(taskCategories, ({ one, many }) => ({
  board: one(boards, {
    fields: [taskCategories.boardId],
    references: [boards.id],
  }),
  tasks: many(tasks),
}));

export const columnsRelations = relations(columns, ({ one, many }) => ({
  board: one(boards, {
    fields: [columns.boardId],
    references: [boards.id],
  }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  board: one(boards, {
    fields: [tasks.boardId],
    references: [boards.id],
  }),
  column: one(columns, {
    fields: [tasks.columnId],
    references: [columns.id],
  }),
  client: one(clients, {
    fields: [tasks.clientId],
    references: [clients.id],
  }),
  category: one(taskCategories, {
    fields: [tasks.categoryId],
    references: [taskCategories.id],
  }),
  assignees: many(taskAssignees),
  collaborators: many(taskCollaborators),
  stakeholders: many(taskStakeholders),
  assets: many(assets),
  tags: many(taskTags),
  comments: many(comments),
  pendingNotifications: many(pendingNotifications),
}));

export const contributorsRelations = relations(contributors, ({ one, many }) => ({
  board: one(boards, {
    fields: [contributors.boardId],
    references: [boards.id],
  }),
  user: one(users, {
    fields: [contributors.userId],
    references: [users.id],
  }),
  taskAssignees: many(taskAssignees),
  taskCollaborators: many(taskCollaborators),
  taskStakeholders: many(taskStakeholders),
  comments: many(comments),
  commentsAsStakeholder: many(comments),
  pendingNotificationsAsRecipient: many(pendingNotifications),
  pendingNotificationsAsTriggerer: many(pendingNotifications),
}));

export const taskAssigneesRelations = relations(taskAssignees, ({ one }) => ({
  task: one(tasks, {
    fields: [taskAssignees.taskId],
    references: [tasks.id],
  }),
  contributor: one(contributors, {
    fields: [taskAssignees.contributorId],
    references: [contributors.id],
  }),
}));

export const taskCollaboratorsRelations = relations(taskCollaborators, ({ one }) => ({
  task: one(tasks, {
    fields: [taskCollaborators.taskId],
    references: [tasks.id],
  }),
  contributor: one(contributors, {
    fields: [taskCollaborators.contributorId],
    references: [contributors.id],
  }),
}));

export const taskStakeholdersRelations = relations(taskStakeholders, ({ one }) => ({
  task: one(tasks, {
    fields: [taskStakeholders.taskId],
    references: [tasks.id],
  }),
  contributor: one(contributors, {
    fields: [taskStakeholders.contributorId],
    references: [contributors.id],
  }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  board: one(boards, {
    fields: [tags.boardId],
    references: [boards.id],
  }),
  taskTags: many(taskTags),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, {
    fields: [taskTags.taskId],
    references: [tasks.id],
  }),
  tag: one(tags, {
    fields: [taskTags.tagId],
    references: [tags.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id],
  }),
  board: one(boards, {
    fields: [comments.boardId],
    references: [boards.id],
  }),
  author: one(contributors, {
    fields: [comments.authorId],
    references: [contributors.id],
  }),
  stakeholder: one(contributors, {
    fields: [comments.stakeholderId],
    references: [contributors.id],
  }),
}));

export const pendingNotificationsRelations = relations(pendingNotifications, ({ one }) => ({
  board: one(boards, {
    fields: [pendingNotifications.boardId],
    references: [boards.id],
  }),
  task: one(tasks, {
    fields: [pendingNotifications.taskId],
    references: [tasks.id],
  }),
  recipient: one(contributors, {
    fields: [pendingNotifications.recipientId],
    references: [contributors.id],
  }),
  triggeredBy: one(contributors, {
    fields: [pendingNotifications.triggeredById],
    references: [contributors.id],
  }),
}));

// sentEmails has no relations - it's a standalone log table

// ============================================================
// TYPE EXPORTS
// ============================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type BoardMember = typeof boardMembers.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;
export type Column = typeof columns.$inferSelect;
export type NewColumn = typeof columns.$inferInsert;
export type TaskCategory = typeof taskCategories.$inferSelect;
export type NewTaskCategory = typeof taskCategories.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Contributor = typeof contributors.$inferSelect;
export type NewContributor = typeof contributors.$inferInsert;
export type TaskAssignee = typeof taskAssignees.$inferSelect;
export type TaskStakeholder = typeof taskStakeholders.$inferSelect;
export type TaskCollaborator = typeof taskCollaborators.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ReviewNote = typeof reviewNotes.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type TaskTag = typeof taskTags.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type PendingNotification = typeof pendingNotifications.$inferSelect;
export type NewPendingNotification = typeof pendingNotifications.$inferInsert;
export type SentEmail = typeof sentEmails.$inferSelect;
export type NewSentEmail = typeof sentEmails.$inferInsert;

export const clientsRelations = relations(clients, ({ many }) => ({
  boards: many(boards),
  assets: many(assets),
  approvals: many(approvals),
  communities: many(communities),
  topics: many(topics),
  scheduledPosts: many(scheduledPosts),
}));

export const assetsRelations = relations(assets, ({ one, many }) => ({
  client: one(clients, { fields: [assets.clientId], references: [clients.id] }),
  task: one(tasks, { fields: [assets.taskId], references: [tasks.id] }),
  approvals: many(approvals),
  notes: many(reviewNotes),
}));

export const approvalsRelations = relations(approvals, ({ one, many }) => ({
  asset: one(assets, { fields: [approvals.assetId], references: [assets.id] }),
  client: one(clients, {
    fields: [approvals.clientId],
    references: [clients.id],
  }),
  notes: many(reviewNotes),
}));

export const reviewNotesRelations = relations(reviewNotes, ({ one }) => ({
  approval: one(approvals, {
    fields: [reviewNotes.approvalId],
    references: [approvals.id],
  }),
  asset: one(assets, {
    fields: [reviewNotes.assetId],
    references: [assets.id],
  }),
}));

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  client: one(clients, {
    fields: [communities.clientId],
    references: [clients.id],
  }),
  broadcasts: many(broadcasts),
}));

export const broadcastsRelations = relations(broadcasts, ({ one }) => ({
  community: one(communities, {
    fields: [broadcasts.communityId],
    references: [communities.id],
  }),
}));

export const topicsRelations = relations(topics, ({ one }) => ({
  client: one(clients, { fields: [topics.clientId], references: [clients.id] }),
  briefTask: one(tasks, {
    fields: [topics.briefTaskId],
    references: [tasks.id],
  }),
}));

export const captionDraftsRelations = relations(captionDrafts, ({ one }) => ({
  client: one(clients, {
    fields: [captionDrafts.clientId],
    references: [clients.id],
  }),
  asset: one(assets, {
    fields: [captionDrafts.assetId],
    references: [assets.id],
  }),
  task: one(tasks, { fields: [captionDrafts.taskId], references: [tasks.id] }),
}));

export const scheduledPostsRelations = relations(scheduledPosts, ({ one }) => ({
  client: one(clients, {
    fields: [scheduledPosts.clientId],
    references: [clients.id],
  }),
  asset: one(assets, {
    fields: [scheduledPosts.assetId],
    references: [assets.id],
  }),
}));

// ── Docs ───────────────────────────────────────────────────────────────────
// A doc is writing that belongs to a client. It is deliberately NOT a task:
// tasks are work with a column, a status and a deadline, while a doc is prose
// that may describe work, brief it, or have nothing to do with any single
// piece of it. `taskId` is an optional link for the cases where a doc really is
// one task's brief; it is never required, and a doc is never listed as a task.

export const docs = sqliteTable("docs", {
  id: text("id").primaryKey(), // UUID
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** Optional: the one task this doc briefs, when it briefs one at all. */
  taskId: text("task_id").references(() => tasks.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  /** TipTap JSON for the whole document. `docBlocks` is the flattened form. */
  content: text("content"),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
});

/**
 * One row per top-level block of a doc, rewritten whenever the doc is saved.
 *
 * Blocks are persisted rather than derived so a deep link can name a block that
 * survives editing: `blockId` is stable for the life of the block, where a
 * positional index shifts the moment something is inserted above it.
 */
export const docBlocks = sqliteTable(
  "doc_blocks",
  {
    id: text("id").primaryKey(), // UUID, stable across edits
    docId: text("doc_id")
      .notNull()
      .references(() => docs.id, { onDelete: "cascade" }),
    /** Position in the document, 0-based. Rewritten on every save. */
    position: integer("position").notNull(),
    /** TipTap node type: paragraph, heading, bulletList, blockquote, ... */
    type: text("type").notNull(),
    /** Heading level where the type carries one. */
    level: integer("level"),
    /** Plain text of the block, which is what search indexes. */
    text: text("text").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  },
  (table) => [index("doc_blocks_doc_position_idx").on(table.docId, table.position)],
);

export const docsRelations = relations(docs, ({ one, many }) => ({
  client: one(clients, {
    fields: [docs.clientId],
    references: [clients.id],
  }),
  task: one(tasks, {
    fields: [docs.taskId],
    references: [tasks.id],
  }),
  author: one(users, {
    fields: [docs.createdBy],
    references: [users.id],
  }),
  blocks: many(docBlocks),
}));

export const docBlocksRelations = relations(docBlocks, ({ one }) => ({
  doc: one(docs, {
    fields: [docBlocks.docId],
    references: [docs.id],
  }),
}));

// ── Docs search index ──────────────────────────────────────────────────────
// One row per searchable unit: a task title, a block of a task doc, a comment,
// an asset, a topic, a community, a broadcast or a client. Kept in step with
// the source tables by src/lib/search/indexer.ts; ids are deterministic
// (sourceType:sourceId:suffix) so a re-index is a clean delete+insert.

export const SEARCH_SOURCE_TYPES = [
  "task_title",
  "task_block",
  "doc_title",
  "doc_block",
  "comment",
  "asset",
  "topic",
  "community",
  "broadcast",
  "client",
] as const;
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

export const searchBlocks = sqliteTable("search_blocks", {
  id: text("id").primaryKey(), // deterministic: sourceType:sourceId:suffix
  sourceType: text("source_type").notNull().$type<SearchSourceType>(),
  sourceId: text("source_id").notNull(),
  blockId: text("block_id"),
  blockIndex: integer("block_index"),
  boardId: text("board_id"),
  clientId: text("client_id"),
  taskId: text("task_id"),
  docId: text("doc_id"),
  sourceTitle: text("source_title").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  indexedAt: integer("indexed_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
