import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const streamers = sqliteTable("streamers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  douyinName: text("douyin_name"),
  note: text("note"),
  status: text("status").notNull().default("active"),
  defaultRuleTemplateId: text("default_rule_template_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    role: text("role").notNull(),
    streamerId: text("streamer_id").references(() => streamers.id),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    status: text("status").notNull().default("active"),
    activeSessionId: text("active_session_id"),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    usernameUnique: uniqueIndex("accounts_username_unique").on(table.username)
  })
);

export const accountSessions = sqliteTable(
  "account_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at")
  },
  (table) => ({
    accountIdx: index("account_sessions_account_idx").on(table.accountId),
    tokenHashIdx: index("account_sessions_token_hash_idx").on(table.tokenHash),
    statusIdx: index("account_sessions_status_idx").on(table.status)
  })
);

export const fans = sqliteTable("fans", {
  id: text("id").primaryKey(),
  streamerId: text("streamer_id")
    .notNull()
    .references(() => streamers.id),
  displayName: text("display_name").notNull(),
  douyinName: text("douyin_name"),
  wechatName: text("wechat_name"),
  gameName: text("game_name"),
  fanGroupLevel: text("fan_group_level"),
  statusesJson: text("statuses_json").notNull().default("[]"),
  isPublicInBalanceBoard: integer("is_public_in_balance_board", { mode: "boolean" })
    .notNull()
    .default(false),
  publicName: text("public_name"),
  cachedTicketBalance: integer("cached_ticket_balance").notNull().default(0),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const seasons = sqliteTable("seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  gameVersion: text("game_version"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  note: text("note")
});

export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  streamerId: text("streamer_id").references(() => streamers.id),
  seasonId: text("season_id").references(() => seasons.id),
  name: text("name").notNull(),
  alias: text("alias"),
  category: text("category"),
  tagsJson: text("tags_json").notNull().default("[]"),
  note: text("note"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const ruleTemplates = sqliteTable("rule_templates", {
  id: text("id").primaryKey(),
  streamerId: text("streamer_id")
    .notNull()
    .references(() => streamers.id),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  oldFanSlots: integer("old_fan_slots").notNull().default(5),
  newFanSlots: integer("new_fan_slots").notNull().default(2),
  requiresEightPlayers: integer("requires_eight_players", { mode: "boolean" })
    .notNull()
    .default(true),
  allowCasualMode: integer("allow_casual_mode", { mode: "boolean" }).notNull().default(true),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const liveSessions = sqliteTable("live_sessions", {
  id: text("id").primaryKey(),
  streamerId: text("streamer_id")
    .notNull()
    .references(() => streamers.id),
  title: text("title").notNull(),
  sessionType: text("session_type").notNull(),
  ruleTemplateId: text("rule_template_id").references(() => ruleTemplates.id),
  status: text("status").notNull().default("preparing"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  settledAt: text("settled_at"),
  settlementConfirmedBy: text("settlement_confirmed_by").references(() => accounts.id),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const rankingSnapshots = sqliteTable("ranking_snapshots", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => liveSessions.id),
  title: text("title").notNull(),
  roundNo: integer("round_no").notNull(),
  style: text("style").notNull(),
  status: text("status").notNull().default("draft"),
  countdownSeconds: integer("countdown_seconds").notNull().default(180),
  countdownStartedAt: text("countdown_started_at"),
  countdownEndsAt: text("countdown_ends_at"),
  frozenAt: text("frozen_at"),
  screenshotId: text("screenshot_id"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const rankingEntries = sqliteTable("ranking_entries", {
  id: text("id").primaryKey(),
  rankingSnapshotId: text("ranking_snapshot_id")
    .notNull()
    .references(() => rankingSnapshots.id),
  fanId: text("fan_id").references(() => fans.id),
  displayNameAtTime: text("display_name_at_time").notNull(),
  douyinNameAtTime: text("douyin_name_at_time"),
  rankOrder: integer("rank_order").notNull(),
  giftDiamonds: integer("gift_diamonds").notNull().default(0),
  ticketUsed: integer("ticket_used").notNull().default(0),
  manualAdjustment: integer("manual_adjustment").notNull().default(0),
  competitionScore: integer("competition_score").notNull().default(0),
  fanTypeAtTime: text("fan_type_at_time").notNull().default("unknown"),
  seatDecision: text("seat_decision").notNull().default("pending"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const liveSessionBoardEntries = sqliteTable("live_session_board_entries", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => liveSessions.id),
  fanId: text("fan_id")
    .notNull()
    .references(() => fans.id),
  giftDiamonds: integer("gift_diamonds").notNull().default(0),
  ticketUsed: integer("ticket_used").notNull().default(0),
  ticketDeposit: integer("ticket_deposit").notNull().default(0),
  manualAdjustment: integer("manual_adjustment").notNull().default(0),
  status: text("status").notNull().default("normal"),
  tieOrder: integer("tie_order").notNull().default(0),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const gameMatches = sqliteTable("game_matches", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => liveSessions.id),
  rankingSnapshotId: text("ranking_snapshot_id").references(() => rankingSnapshots.id),
  matchNo: integer("match_no").notNull(),
  mode: text("mode").notNull(),
  seasonId: text("season_id").references(() => seasons.id),
  status: text("status").notNull().default("preparing"),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const matchSeats = sqliteTable("match_seats", {
  id: text("id").primaryKey(),
  matchId: text("match_id")
    .notNull()
    .references(() => gameMatches.id),
  seatNo: integer("seat_no").notNull(),
  fanId: text("fan_id").references(() => fans.id),
  seatType: text("seat_type").notNull(),
  gameNameAtTime: text("game_name_at_time"),
  status: text("status").notNull().default("alive"),
  eliminatedAt: text("eliminated_at"),
  finalRank: integer("final_rank"),
  note: text("note"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const cardLocks = sqliteTable("card_locks", {
  id: text("id").primaryKey(),
  matchId: text("match_id")
    .notNull()
    .references(() => gameMatches.id),
  seatId: text("seat_id")
    .notNull()
    .references(() => matchSeats.id),
  cardId: text("card_id")
    .notNull()
    .references(() => cards.id),
  action: text("action").notNull(),
  isActiveOccupy: integer("is_active_occupy", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
  createdAt: text("created_at").notNull()
});

export const ticketLedgers = sqliteTable("ticket_ledgers", {
  id: text("id").primaryKey(),
  streamerId: text("streamer_id")
    .notNull()
    .references(() => streamers.id),
  fanId: text("fan_id")
    .notNull()
    .references(() => fans.id),
  sessionId: text("session_id").references(() => liveSessions.id),
  rankingSnapshotId: text("ranking_snapshot_id").references(() => rankingSnapshots.id),
  type: text("type").notNull(),
  amount: integer("amount").notNull(),
  affectsBalance: integer("affects_balance", { mode: "boolean" }).notNull().default(false),
  affectsCompetition: integer("affects_competition", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("normal"),
  voidedBy: text("voided_by").references(() => accounts.id),
  voidedAt: text("voided_at"),
  note: text("note"),
  createdBy: text("created_by")
    .notNull()
    .references(() => accounts.id),
  createdAt: text("created_at").notNull()
});

export const screenshots = sqliteTable("screenshots", {
  id: text("id").primaryKey(),
  streamerId: text("streamer_id")
    .notNull()
    .references(() => streamers.id),
  sessionId: text("session_id").references(() => liveSessions.id),
  matchId: text("match_id").references(() => gameMatches.id),
  fanId: text("fan_id").references(() => fans.id),
  type: text("type").notNull(),
  storageKey: text("storage_key").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  status: text("status").notNull().default("normal"),
  deletedAt: text("deleted_at"),
  note: text("note"),
  createdBy: text("created_by")
    .notNull()
    .references(() => accounts.id),
  createdAt: text("created_at").notNull()
});

export const publicSettings = sqliteTable(
  "public_settings",
  {
    id: text("id").primaryKey(),
    streamerId: text("streamer_id")
      .notNull()
      .references(() => streamers.id),
    module: text("module").notNull(),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(false),
    visibleFieldsJson: text("visible_fields_json").notNull().default("[]"),
    filterableFieldsJson: text("filterable_fields_json").notNull().default("[]"),
    note: text("note"),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    streamerModuleUnique: uniqueIndex("public_settings_streamer_module_unique").on(
      table.streamerId,
      table.module
    )
  })
);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorAccountId: text("actor_account_id")
    .notNull()
    .references(() => accounts.id),
  actorRole: text("actor_role").notNull(),
  streamerId: text("streamer_id").references(() => streamers.id),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  note: text("note"),
  createdAt: text("created_at").notNull()
});
