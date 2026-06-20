import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";

type Bindings = {
  DB: D1Database;
  SCREENSHOTS?: R2Bucket;
  ADMIN_SETUP_TOKEN?: string;
};

const app = new Hono<{ Bindings: Bindings }>();
const sessionCookieName = "jcc_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

type AccountRow = {
  id: string;
  role: string;
  streamer_id: string | null;
  username: string;
  password_hash: string;
  display_name: string;
  status: string;
  active_session_id: string | null;
};

type PublicAccount = {
  id: string;
  role: string;
  streamerId: string | null;
  username: string;
  displayName: string;
};

type StreamerAccountRow = {
  streamer_id: string;
  streamer_name: string;
  douyin_name: string | null;
  streamer_note: string | null;
  streamer_status: string;
  account_id: string | null;
  username: string | null;
  display_name: string | null;
  account_status: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type FanRow = {
  id: string;
  streamer_id: string;
  display_name: string;
  douyin_name: string | null;
  wechat_name: string | null;
  game_name: string | null;
  fan_group_level: string | null;
  statuses_json: string;
  is_public_in_balance_board: number;
  public_name: string | null;
  cached_ticket_balance: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type LiveSessionRow = {
  id: string;
  streamer_id: string;
  streamer_name: string | null;
  title: string;
  session_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  settled_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type TicketLedgerRow = {
  id: string;
  streamer_id: string;
  fan_id: string;
  fan_name: string;
  session_id: string | null;
  session_title: string | null;
  type: string;
  amount: number;
  affects_balance: number;
  affects_competition: number;
  status: string;
  note: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  voided_at: string | null;
};

type RankingSnapshotRow = {
  id: string;
  session_id: string;
  session_title: string;
  streamer_id: string;
  title: string;
  round_no: number;
  style: string;
  status: string;
  countdown_seconds: number;
  countdown_started_at: string | null;
  countdown_ends_at: string | null;
  frozen_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type RankingEntryRow = {
  id: string;
  ranking_snapshot_id: string;
  fan_id: string | null;
  display_name_at_time: string;
  douyin_name_at_time: string | null;
  rank_order: number;
  gift_diamonds: number;
  ticket_used: number;
  manual_adjustment: number;
  competition_score: number;
  fan_type_at_time: string;
  seat_decision: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type LiveSessionBoardEntryRow = {
  id: string;
  session_id: string;
  fan_id: string;
  display_name: string;
  douyin_name: string | null;
  statuses_json: string;
  cached_ticket_balance: number;
  gift_diamonds: number;
  ticket_used: number;
  ticket_deposit: number;
  manual_adjustment: number;
  status: string;
  tie_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

type StreamerOptionRow = {
  id: string;
  name: string;
};

app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

function jsonError(message: string, status = 400) {
  return { error: message, status };
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function createPassword(length = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => chars[byte % chars.length]).join("");
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hashPassword(password: string, salt = crypto.randomUUID()) {
  return `sha256_salted$${salt}$${await sha256(`${salt}:${password}`)}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, expectedHash] = storedHash.split("$");
  if (algorithm !== "sha256_salted" || !salt || !expectedHash) {
    return false;
  }

  const actual = fromHex(await sha256(`${salt}:${password}`));
  const expected = fromHex(expectedHash);
  if (actual.length !== expected.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) {
    diff |= actual[index] ^ expected[index];
  }

  return diff === 0;
}

function toPublicAccount(account: AccountRow): PublicAccount {
  return {
    id: account.id,
    role: account.role,
    streamerId: account.streamer_id,
    username: account.username,
    displayName: account.display_name
  };
}

async function countAccounts(db: D1Database) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM accounts").first<{ count: number }>();
  return row?.count ?? 0;
}

async function writeAuditLog(
  db: D1Database,
  account: PublicAccount,
  action: string,
  targetType: string,
  targetId: string,
  note?: string,
  targetStreamerId?: string | null
) {
  await db
    .prepare(
      `INSERT INTO audit_logs
        (id, actor_account_id, actor_role, streamer_id, action, target_type, target_id, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      createId("log"),
      account.id,
      account.role,
      targetStreamerId ?? account.streamerId,
      action,
      targetType,
      targetId,
      note ?? null,
      nowIso()
    )
    .run();
}

async function getCurrentAccount(db: D1Database, token?: string) {
  if (!token) {
    return null;
  }

  const tokenHash = await sha256(token);
  const account = await db
    .prepare(
      `SELECT accounts.*
       FROM account_sessions
       INNER JOIN accounts ON accounts.id = account_sessions.account_id
       WHERE account_sessions.token_hash = ?
         AND account_sessions.status = 'active'
         AND account_sessions.expires_at > ?
         AND accounts.status = 'active'
         AND accounts.active_session_id = account_sessions.id`
    )
    .bind(tokenHash, nowIso())
    .first<AccountRow>();

  return account ?? null;
}

function toStreamerAccount(row: StreamerAccountRow) {
  return {
    streamer: {
      id: row.streamer_id,
      name: row.streamer_name,
      douyinName: row.douyin_name,
      note: row.streamer_note,
      status: row.streamer_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    },
    account: row.account_id
      ? {
          id: row.account_id,
          username: row.username,
          displayName: row.display_name,
          status: row.account_status,
          lastLoginAt: row.last_login_at
        }
      : null
  };
}

function parseStatuses(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function normalizeStatuses(statuses?: string[]) {
  const allowed = new Set(["new_fan", "old_fan", "manager", "violated", "blacklisted"]);
  return [...new Set((statuses ?? []).filter((status) => allowed.has(status)))];
}

function toFan(row: FanRow) {
  return {
    id: row.id,
    streamerId: row.streamer_id,
    displayName: row.display_name,
    douyinName: row.douyin_name,
    wechatName: row.wechat_name,
    gameName: row.game_name,
    fanGroupLevel: row.fan_group_level,
    statuses: parseStatuses(row.statuses_json),
    isPublicInBalanceBoard: Boolean(row.is_public_in_balance_board),
    publicName: row.public_name,
    cachedTicketBalance: row.cached_ticket_balance,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSessionType(value?: string) {
  const allowed = new Set(["afternoon", "evening", "custom"]);
  return value && allowed.has(value) ? value : "custom";
}

function normalizeSessionStatus(value?: string) {
  const allowed = new Set(["preparing", "live", "pending_settlement", "settled", "cancelled"]);
  return value && allowed.has(value) ? value : null;
}

function toLiveSession(row: LiveSessionRow) {
  return {
    id: row.id,
    streamerId: row.streamer_id,
    streamerName: row.streamer_name,
    title: row.title,
    sessionType: row.session_type,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    settledAt: row.settled_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeTicketType(value?: string) {
  const allowed = new Set(["deposit", "withdraw", "gift", "adjustment"]);
  return value && allowed.has(value) ? value : null;
}

function ticketBalanceDelta(type: string, amount: number) {
  if (type === "deposit" || type === "adjustment") return amount;
  if (type === "withdraw") return -amount;
  return 0;
}

function ticketAffectsBalance(type: string) {
  return type === "deposit" || type === "withdraw" || type === "adjustment";
}

function ticketAffectsCompetition(type: string) {
  return type === "withdraw" || type === "gift";
}

async function getFanTicketBalance(db: D1Database, fanId: string) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE
           WHEN type = 'deposit' THEN amount
           WHEN type = 'withdraw' THEN -amount
           WHEN type = 'adjustment' THEN amount
           ELSE 0
         END
       ), 0) AS balance
       FROM ticket_ledgers
       WHERE fan_id = ? AND status = 'normal' AND affects_balance = 1`
    )
    .bind(fanId)
    .first<{ balance: number }>();

  return row?.balance ?? 0;
}

function toTicketLedger(row: TicketLedgerRow) {
  return {
    id: row.id,
    streamerId: row.streamer_id,
    fanId: row.fan_id,
    fanName: row.fan_name,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    type: row.type,
    amount: row.amount,
    affectsBalance: Boolean(row.affects_balance),
    affectsCompetition: Boolean(row.affects_competition),
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    voidedAt: row.voided_at
  };
}

function normalizeRankingStyle(value?: string) {
  const allowed = new Set(["top5", "top7"]);
  return value && allowed.has(value) ? value : "top7";
}

function rankingSeatLimit(style: string) {
  return style === "top5" ? 5 : 7;
}

function normalizeSeatDecision(value?: string) {
  const allowed = new Set(["waitlist", "away"]);
  return value && allowed.has(value) ? value : "waitlist";
}

function normalizeBoardStatus(value?: string) {
  const allowed = new Set(["normal", "new_fan", "away", "pending", "blocked"]);
  return value && allowed.has(value) ? value : "normal";
}

function boardCompetitionScore(row: {
  gift_diamonds: number;
  ticket_used: number;
  ticket_deposit: number;
  manual_adjustment: number;
}) {
  return row.gift_diamonds + row.ticket_used - row.ticket_deposit + row.manual_adjustment;
}

function boardStatusToSeatDecision(status: string) {
  if (status === "away") return "away";
  if (status === "blocked") return "blocked";
  return "waitlist";
}

function fanTypeFromStatuses(statuses: string[]) {
  if (statuses.includes("new_fan")) return "new_fan";
  if (statuses.includes("old_fan")) return "old_fan";
  return "unknown";
}

function toRankingSnapshot(row: RankingSnapshotRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    streamerId: row.streamer_id,
    title: row.title,
    roundNo: row.round_no,
    style: row.style,
    status: row.status,
    countdownSeconds: row.countdown_seconds,
    countdownStartedAt: row.countdown_started_at,
    countdownEndsAt: row.countdown_ends_at,
    frozenAt: row.frozen_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toRankingEntry(row: RankingEntryRow) {
  return {
    id: row.id,
    rankingSnapshotId: row.ranking_snapshot_id,
    fanId: row.fan_id,
    displayNameAtTime: row.display_name_at_time,
    douyinNameAtTime: row.douyin_name_at_time,
    rankOrder: row.rank_order,
    giftDiamonds: row.gift_diamonds,
    ticketUsed: row.ticket_used,
    manualAdjustment: row.manual_adjustment,
    competitionScore: row.competition_score,
    fanTypeAtTime: row.fan_type_at_time,
    seatDecision: row.seat_decision,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toBoardEntry(row: LiveSessionBoardEntryRow) {
  const score = boardCompetitionScore(row);
  return {
    id: row.id,
    sessionId: row.session_id,
    fanId: row.fan_id,
    displayName: row.display_name,
    douyinName: row.douyin_name,
    fanStatuses: parseStatuses(row.statuses_json),
    cachedTicketBalance: row.cached_ticket_balance,
    giftDiamonds: row.gift_diamonds,
    ticketUsed: row.ticket_used,
    ticketDeposit: row.ticket_deposit,
    manualAdjustment: row.manual_adjustment,
    competitionScore: score,
    balancePreview: row.cached_ticket_balance - row.ticket_used + row.ticket_deposit,
    status: row.status,
    tieOrder: row.tie_order,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function recomputeRankingDecisions(db: D1Database, snapshotId: string, style: string) {
  const entries = await db
    .prepare(
      `SELECT
         ranking_entries.*,
         fans.statuses_json AS statuses_json
       FROM ranking_entries
       LEFT JOIN fans ON fans.id = ranking_entries.fan_id
       WHERE ranking_entries.ranking_snapshot_id = ?
       ORDER BY ranking_entries.competition_score DESC, ranking_entries.rank_order ASC`
    )
    .bind(snapshotId)
    .all<RankingEntryRow & { statuses_json: string | null }>();

  let recommendedCount = 0;
  const limit = rankingSeatLimit(style);
  const timestamp = nowIso();
  const updates = entries.results.map((entry) => {
    const statuses = parseStatuses(entry.statuses_json ?? "[]");
    let decision = "waitlist";

    if (statuses.includes("blacklisted")) {
      decision = "blocked";
    } else if (entry.seat_decision === "away") {
      decision = "away";
    } else if (recommendedCount < limit) {
      decision = "recommended";
      recommendedCount += 1;
    }

    return db
      .prepare("UPDATE ranking_entries SET seat_decision = ?, updated_at = ? WHERE id = ?")
      .bind(decision, timestamp, entry.id);
  });

  if (updates.length > 0) {
    await db.batch(updates);
  }
}

async function replaceRankingEntriesFromBoard(db: D1Database, snapshot: RankingSnapshotRow) {
  const boardRows = await db
    .prepare(
      `SELECT
         live_session_board_entries.*,
         fans.display_name,
         fans.douyin_name,
         fans.statuses_json,
         fans.cached_ticket_balance
       FROM live_session_board_entries
       INNER JOIN fans ON fans.id = live_session_board_entries.fan_id
       WHERE live_session_board_entries.session_id = ?
       ORDER BY
         CASE live_session_board_entries.status
           WHEN 'normal' THEN 1
           WHEN 'new_fan' THEN 2
           WHEN 'pending' THEN 3
           WHEN 'away' THEN 4
           WHEN 'blocked' THEN 5
           ELSE 6
         END,
         (live_session_board_entries.gift_diamonds + live_session_board_entries.ticket_used
          - live_session_board_entries.ticket_deposit + live_session_board_entries.manual_adjustment) DESC,
         live_session_board_entries.tie_order ASC,
         live_session_board_entries.updated_at ASC`
    )
    .bind(snapshot.session_id)
    .all<LiveSessionBoardEntryRow>();

  const timestamp = nowIso();
  await db.prepare("DELETE FROM ranking_entries WHERE ranking_snapshot_id = ?").bind(snapshot.id).run();

  let rankOrder = 1;
  const inserts = boardRows.results.map((entry) => {
    const statuses = parseStatuses(entry.statuses_json);
    const fanType = entry.status === "new_fan" || statuses.includes("new_fan") ? "new_fan" : fanTypeFromStatuses(statuses);
    const score = boardCompetitionScore(entry);
    return db
      .prepare(
        `INSERT INTO ranking_entries
          (id, ranking_snapshot_id, fan_id, display_name_at_time, douyin_name_at_time, rank_order,
           gift_diamonds, ticket_used, manual_adjustment, competition_score, fan_type_at_time,
           seat_decision, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createId("rent"),
        snapshot.id,
        entry.fan_id,
        entry.display_name,
        entry.douyin_name,
        rankOrder++,
        entry.gift_diamonds,
        entry.ticket_used,
        entry.manual_adjustment - entry.ticket_deposit,
        score,
        fanType,
        boardStatusToSeatDecision(entry.status),
        entry.note,
        timestamp,
        timestamp
      );
  });

  if (inserts.length > 0) {
    await db.batch(inserts);
  }
  await recomputeRankingDecisions(db, snapshot.id, snapshot.style);
}

async function autoFreezeDueRankings(db: D1Database, sessionId: string) {
  const timestamp = nowIso();
  const dueSnapshots = await db
    .prepare(
      `SELECT
         ranking_snapshots.*,
         live_sessions.title AS session_title,
         live_sessions.streamer_id AS streamer_id
       FROM ranking_snapshots
       INNER JOIN live_sessions ON live_sessions.id = ranking_snapshots.session_id
       WHERE ranking_snapshots.session_id = ?
         AND ranking_snapshots.status = 'countdown'
         AND ranking_snapshots.countdown_ends_at IS NOT NULL
         AND ranking_snapshots.countdown_ends_at <= ?`
    )
    .bind(sessionId, timestamp)
    .all<RankingSnapshotRow>();

  for (const snapshot of dueSnapshots.results) {
    await replaceRankingEntriesFromBoard(db, snapshot);
    await db
      .prepare("UPDATE ranking_snapshots SET status = 'frozen', frozen_at = ?, updated_at = ? WHERE id = ?")
      .bind(timestamp, timestamp, snapshot.id)
      .run();
  }
}

async function refreshFanTicketBalance(db: D1Database, fanId: string) {
  const balance = await getFanTicketBalance(db, fanId);

  await db
    .prepare("UPDATE fans SET cached_ticket_balance = ?, updated_at = ? WHERE id = ?")
    .bind(balance, nowIso(), fanId)
    .run();
}

async function listAccessibleStreamers(db: D1Database, account: AccountRow) {
  if (account.role === "admin") {
    const result = await db
      .prepare("SELECT id, name FROM streamers WHERE status = 'active' ORDER BY created_at DESC")
      .all<StreamerOptionRow>();
    return result.results;
  }

  if (!account.streamer_id) {
    return [];
  }

  const row = await db
    .prepare("SELECT id, name FROM streamers WHERE id = ? AND status = 'active'")
    .bind(account.streamer_id)
    .first<StreamerOptionRow>();

  return row ? [row] : [];
}

async function resolveStreamerId(db: D1Database, account: AccountRow, requestedStreamerId?: string | null) {
  const streamers = await listAccessibleStreamers(db, account);
  if (streamers.length === 0) {
    return { streamerId: null, streamers };
  }

  if (account.role === "streamer") {
    return { streamerId: account.streamer_id, streamers };
  }

  if (requestedStreamerId && streamers.some((streamer) => streamer.id === requestedStreamerId)) {
    return { streamerId: requestedStreamerId, streamers };
  }

  return { streamerId: streamers[0].id, streamers };
}

app.get("/api/health", (context) => {
  const screenshotsConfigured = Boolean(context.env.SCREENSHOTS);

  return context.json({
    ok: true,
    service: "jcc-web-new",
    storage: {
      database: Boolean(context.env.DB),
      screenshots: screenshotsConfigured,
      screenshotsStatus: screenshotsConfigured ? "ready" : "deferred"
    }
  });
});

app.get("/api/setup/status", async (context) => {
  const accountCount = await countAccounts(context.env.DB);

  return context.json({
    needsAdminSetup: accountCount === 0,
    requiresSetupToken: Boolean(context.env.ADMIN_SETUP_TOKEN)
  });
});

app.post("/api/setup/admin", async (context) => {
  const accountCount = await countAccounts(context.env.DB);
  if (accountCount > 0) {
    return context.json(jsonError("管理员已经初始化，不能重复创建。"), 409);
  }

  const body = await context.req.json<{
    username?: string;
    password?: string;
    displayName?: string;
    setupToken?: string;
  }>();

  if (context.env.ADMIN_SETUP_TOKEN && body.setupToken !== context.env.ADMIN_SETUP_TOKEN) {
    return context.json(jsonError("初始化口令不正确。", 403), 403);
  }

  const username = body.username?.trim();
  const password = body.password ?? "";
  const displayName = body.displayName?.trim() || "管理员";

  if (!username || username.length < 3) {
    return context.json(jsonError("账号至少需要 3 个字符。"), 400);
  }

  if (password.length < 8) {
    return context.json(jsonError("密码至少需要 8 个字符。"), 400);
  }

  const adminId = createId("acc");
  const timestamp = nowIso();

  await context.env.DB.prepare(
    `INSERT INTO accounts
      (id, role, streamer_id, username, password_hash, display_name, status, created_at, updated_at)
     VALUES (?, 'admin', NULL, ?, ?, ?, 'active', ?, ?)`
  )
    .bind(adminId, username, await hashPassword(password), displayName, timestamp, timestamp)
    .run();

  const account: PublicAccount = {
    id: adminId,
    role: "admin",
    streamerId: null,
    username,
    displayName
  };
  await writeAuditLog(context.env.DB, account, "setup_admin", "account", adminId, "初始化管理员账号");

  return context.json({ account });
});

app.post("/api/auth/login", async (context) => {
  const body = await context.req.json<{ username?: string; password?: string }>();
  const username = body.username?.trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return context.json(jsonError("请输入账号和密码。"), 400);
  }

  const account = await context.env.DB.prepare("SELECT * FROM accounts WHERE username = ?")
    .bind(username)
    .first<AccountRow>();

  if (!account || account.status !== "active" || !(await verifyPassword(password, account.password_hash))) {
    return context.json(jsonError("账号或密码不正确。", 401), 401);
  }

  const sessionId = createId("ses");
  const token = crypto.randomUUID() + crypto.randomUUID();
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds * 1000).toISOString();

  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE account_sessions SET status = 'revoked', revoked_at = ? WHERE account_id = ? AND status = 'active'"
    ).bind(timestamp, account.id),
    context.env.DB.prepare(
      `INSERT INTO account_sessions
        (id, account_id, token_hash, status, user_agent, ip_address, created_at, expires_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`
    ).bind(
      sessionId,
      account.id,
      await sha256(token),
      context.req.header("user-agent") ?? null,
      context.req.header("cf-connecting-ip") ?? null,
      timestamp,
      expiresAt
    ),
    context.env.DB.prepare(
      "UPDATE accounts SET active_session_id = ?, last_login_at = ?, updated_at = ? WHERE id = ?"
    ).bind(sessionId, timestamp, timestamp, account.id)
  ]);

  setCookie(context, sessionCookieName, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(context.req.url).protocol === "https:",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });

  const publicAccount = toPublicAccount({ ...account, active_session_id: sessionId });
  await writeAuditLog(context.env.DB, publicAccount, "login", "account", account.id, "账号登录");

  return context.json({ account: publicAccount });
});

app.post("/api/auth/logout", async (context) => {
  const token = getCookie(context, sessionCookieName);
  const account = await getCurrentAccount(context.env.DB, token);

  if (token) {
    await context.env.DB.prepare(
      "UPDATE account_sessions SET status = 'revoked', revoked_at = ? WHERE token_hash = ?"
    )
      .bind(nowIso(), await sha256(token))
      .run();
  }

  setCookie(context, sessionCookieName, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(context.req.url).protocol === "https:",
    path: "/",
    maxAge: 0
  });

  if (account) {
    await writeAuditLog(context.env.DB, toPublicAccount(account), "logout", "account", account.id, "账号登出");
  }

  return context.json({ ok: true });
});

app.get("/api/auth/me", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));

  if (!account) {
    return context.json({ account: null });
  }

  return context.json({ account: toPublicAccount(account) });
});

app.get("/api/admin/streamer-accounts", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }
  if (account.role !== "admin") {
    return context.json(jsonError("只有管理员可以管理主播账号。", 403), 403);
  }

  const rows = await context.env.DB.prepare(
    `SELECT
       streamers.id AS streamer_id,
       streamers.name AS streamer_name,
       streamers.douyin_name,
       streamers.note AS streamer_note,
       streamers.status AS streamer_status,
       streamers.created_at,
       streamers.updated_at,
       accounts.id AS account_id,
       accounts.username,
       accounts.display_name,
       accounts.status AS account_status,
       accounts.last_login_at
     FROM streamers
     LEFT JOIN accounts ON accounts.streamer_id = streamers.id AND accounts.role = 'streamer'
     ORDER BY streamers.created_at DESC`
  ).all<StreamerAccountRow>();

  return context.json({ items: rows.results.map(toStreamerAccount) });
});

app.post("/api/admin/streamer-accounts", async (context) => {
  const actor = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!actor) {
    return context.json(jsonError("请先登录。", 401), 401);
  }
  if (actor.role !== "admin") {
    return context.json(jsonError("只有管理员可以创建主播账号。", 403), 403);
  }

  const body = await context.req.json<{
    streamerName?: string;
    douyinName?: string;
    note?: string;
    username?: string;
    displayName?: string;
    password?: string;
  }>();

  const streamerName = body.streamerName?.trim();
  const username = body.username?.trim();
  const displayName = body.displayName?.trim() || streamerName;
  const password = body.password?.trim() || createPassword();

  if (!streamerName) {
    return context.json(jsonError("请填写主播名称。"), 400);
  }
  if (!username || username.length < 3) {
    return context.json(jsonError("主播登录账号至少需要 3 个字符。"), 400);
  }
  if (!displayName) {
    return context.json(jsonError("请填写显示名称。"), 400);
  }
  if (password.length < 8) {
    return context.json(jsonError("密码至少需要 8 个字符。"), 400);
  }

  const existing = await context.env.DB.prepare("SELECT id FROM accounts WHERE username = ?")
    .bind(username)
    .first<{ id: string }>();
  if (existing) {
    return context.json(jsonError("登录账号已存在。"), 409);
  }

  const timestamp = nowIso();
  const streamerId = createId("str");
  const accountId = createId("acc");

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO streamers
        (id, name, douyin_name, note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`
    ).bind(
      streamerId,
      streamerName,
      body.douyinName?.trim() || null,
      body.note?.trim() || null,
      timestamp,
      timestamp
    ),
    context.env.DB.prepare(
      `INSERT INTO accounts
        (id, role, streamer_id, username, password_hash, display_name, status, created_at, updated_at)
       VALUES (?, 'streamer', ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(accountId, streamerId, username, await hashPassword(password), displayName, timestamp, timestamp)
  ]);

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(actor),
    "create_streamer_account",
    "streamer",
    streamerId,
    `创建主播账号：${username}`
  );

  return context.json({
    streamer: {
      id: streamerId,
      name: streamerName,
      douyinName: body.douyinName?.trim() || null,
      note: body.note?.trim() || null,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp
    },
    account: {
      id: accountId,
      username,
      displayName,
      status: "active",
      lastLoginAt: null
    },
    generatedPassword: body.password?.trim() ? null : password
  });
});

app.patch("/api/admin/streamer-accounts/:streamerId", async (context) => {
  const actor = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!actor) {
    return context.json(jsonError("请先登录。", 401), 401);
  }
  if (actor.role !== "admin") {
    return context.json(jsonError("只有管理员可以编辑主播账号。", 403), 403);
  }

  const streamerId = context.req.param("streamerId");
  const body = await context.req.json<{
    streamerName?: string;
    douyinName?: string;
    note?: string;
    username?: string;
    displayName?: string;
  }>();

  const streamerName = body.streamerName?.trim();
  const username = body.username?.trim();
  const displayName = body.displayName?.trim();

  if (!streamerName) {
    return context.json(jsonError("请填写主播名称。"), 400);
  }
  if (!username || username.length < 3) {
    return context.json(jsonError("登录账号至少需要 3 个字符。"), 400);
  }
  if (!displayName) {
    return context.json(jsonError("请填写显示名称。"), 400);
  }

  const row = await context.env.DB.prepare(
    `SELECT streamers.id AS streamer_id, accounts.id AS account_id
     FROM streamers
     LEFT JOIN accounts ON accounts.streamer_id = streamers.id AND accounts.role = 'streamer'
     WHERE streamers.id = ?`
  )
    .bind(streamerId)
    .first<{ streamer_id: string; account_id: string | null }>();

  if (!row) {
    return context.json(jsonError("主播不存在。", 404), 404);
  }
  if (!row.account_id) {
    return context.json(jsonError("主播未绑定登录账号。"), 400);
  }

  const usernameOwner = await context.env.DB.prepare("SELECT id FROM accounts WHERE username = ? AND id <> ?")
    .bind(username, row.account_id)
    .first<{ id: string }>();

  if (usernameOwner) {
    return context.json(jsonError("登录账号已存在。"), 409);
  }

  const timestamp = nowIso();
  await context.env.DB.batch([
    context.env.DB.prepare(
      "UPDATE streamers SET name = ?, douyin_name = ?, note = ?, updated_at = ? WHERE id = ?"
    ).bind(streamerName, body.douyinName?.trim() || null, body.note?.trim() || null, timestamp, streamerId),
    context.env.DB.prepare("UPDATE accounts SET username = ?, display_name = ?, updated_at = ? WHERE id = ?").bind(
      username,
      displayName,
      timestamp,
      row.account_id
    )
  ]);

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(actor),
    "update_streamer_account",
    "streamer",
    streamerId,
    `编辑主播账号：${username}`
  );

  return context.json({ ok: true });
});

app.patch("/api/admin/accounts/:accountId/status", async (context) => {
  const actor = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!actor) {
    return context.json(jsonError("请先登录。", 401), 401);
  }
  if (actor.role !== "admin") {
    return context.json(jsonError("只有管理员可以修改账号状态。", 403), 403);
  }

  const accountId = context.req.param("accountId");
  const body = await context.req.json<{ status?: string }>();
  const status = body.status === "active" ? "active" : body.status === "disabled" ? "disabled" : null;

  if (!status) {
    return context.json(jsonError("状态只能是 active 或 disabled。"), 400);
  }

  const target = await context.env.DB.prepare("SELECT * FROM accounts WHERE id = ?")
    .bind(accountId)
    .first<AccountRow>();

  if (!target) {
    return context.json(jsonError("账号不存在。", 404), 404);
  }
  if (target.role === "admin") {
    return context.json(jsonError("不能在这里停用管理员账号。"), 400);
  }

  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE accounts SET status = ?, updated_at = ? WHERE id = ?").bind(
      status,
      nowIso(),
      accountId
    ),
    context.env.DB.prepare(
      "UPDATE account_sessions SET status = 'revoked', revoked_at = ? WHERE account_id = ? AND status = 'active'"
    ).bind(nowIso(), accountId)
  ]);

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(actor),
    "update_account_status",
    "account",
    accountId,
    `修改账号状态为 ${status}`
  );

  return context.json({ ok: true, status });
});

app.post("/api/admin/accounts/:accountId/reset-password", async (context) => {
  const actor = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!actor) {
    return context.json(jsonError("请先登录。", 401), 401);
  }
  if (actor.role !== "admin") {
    return context.json(jsonError("只有管理员可以重置账号密码。", 403), 403);
  }

  const accountId = context.req.param("accountId");
  const target = await context.env.DB.prepare("SELECT * FROM accounts WHERE id = ?")
    .bind(accountId)
    .first<AccountRow>();

  if (!target) {
    return context.json(jsonError("账号不存在。", 404), 404);
  }
  if (target.role === "admin") {
    return context.json(jsonError("不能在这里重置管理员密码。"), 400);
  }

  const password = createPassword();
  const timestamp = nowIso();

  await context.env.DB.batch([
    context.env.DB.prepare("UPDATE accounts SET password_hash = ?, updated_at = ? WHERE id = ?").bind(
      await hashPassword(password),
      timestamp,
      accountId
    ),
    context.env.DB.prepare(
      "UPDATE account_sessions SET status = 'revoked', revoked_at = ? WHERE account_id = ? AND status = 'active'"
    ).bind(timestamp, accountId)
  ]);

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(actor),
    "reset_account_password",
    "account",
    accountId,
    `重置账号密码：${target.username}`
  );

  return context.json({ password });
});

app.get("/api/fans", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const requestedStreamerId = context.req.query("streamerId");
  const { streamerId, streamers } = await resolveStreamerId(context.env.DB, account, requestedStreamerId);
  if (!streamerId) {
    return context.json({ items: [], streamers, activeStreamerId: null });
  }

  const keyword = context.req.query("q")?.trim();
  const status = context.req.query("status")?.trim();
  const query = keyword ? `%${keyword}%` : null;
  const rows = await context.env.DB.prepare(
    `SELECT *
     FROM fans
     WHERE streamer_id = ?
       AND (
         ? IS NULL
         OR display_name LIKE ?
         OR douyin_name LIKE ?
         OR wechat_name LIKE ?
         OR game_name LIKE ?
       )
     ORDER BY updated_at DESC`
  )
    .bind(streamerId, query, query, query, query, query)
    .all<FanRow>();

  const items = rows.results
    .map(toFan)
    .filter((fan) => !status || fan.statuses.includes(status));

  return context.json({ items, streamers, activeStreamerId: streamerId });
});

app.post("/api/fans", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const body = await context.req.json<{
    streamerId?: string;
    displayName?: string;
    douyinName?: string;
    wechatName?: string;
    gameName?: string;
    fanGroupLevel?: string;
    statuses?: string[];
    isPublicInBalanceBoard?: boolean;
    publicName?: string;
    note?: string;
  }>();
  const { streamerId } = await resolveStreamerId(context.env.DB, account, body.streamerId);
  if (!streamerId) {
    return context.json(jsonError("没有可用的主播空间。"), 400);
  }

  const displayName = body.displayName?.trim();
  if (!displayName) {
    return context.json(jsonError("请填写粉丝名称。"), 400);
  }

  const statuses = normalizeStatuses(body.statuses);
  const timestamp = nowIso();
  const fanId = createId("fan");

  await context.env.DB.prepare(
    `INSERT INTO fans
      (id, streamer_id, display_name, douyin_name, wechat_name, game_name, fan_group_level,
       statuses_json, is_public_in_balance_board, public_name, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      fanId,
      streamerId,
      displayName,
      body.douyinName?.trim() || null,
      body.wechatName?.trim() || null,
      body.gameName?.trim() || null,
      body.fanGroupLevel?.trim() || null,
      JSON.stringify(statuses),
      body.isPublicInBalanceBoard ? 1 : 0,
      body.publicName?.trim() || null,
      body.note?.trim() || null,
      timestamp,
      timestamp
    )
    .run();

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "create_fan",
    "fan",
    fanId,
    `创建粉丝资料：${displayName}`,
    streamerId
  );

  return context.json({ ok: true, id: fanId });
});

app.patch("/api/fans/:fanId", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const fanId = context.req.param("fanId");
  const existing = await context.env.DB.prepare("SELECT * FROM fans WHERE id = ?")
    .bind(fanId)
    .first<FanRow>();

  if (!existing) {
    return context.json(jsonError("粉丝不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, existing.streamer_id);
  if (streamerId !== existing.streamer_id) {
    return context.json(jsonError("没有权限编辑该粉丝。", 403), 403);
  }

  const body = await context.req.json<{
    displayName?: string;
    douyinName?: string;
    wechatName?: string;
    gameName?: string;
    fanGroupLevel?: string;
    statuses?: string[];
    isPublicInBalanceBoard?: boolean;
    publicName?: string;
    note?: string;
  }>();

  const displayName = body.displayName?.trim();
  if (!displayName) {
    return context.json(jsonError("请填写粉丝名称。"), 400);
  }

  const statuses = normalizeStatuses(body.statuses);
  const timestamp = nowIso();

  await context.env.DB.prepare(
    `UPDATE fans
     SET display_name = ?,
         douyin_name = ?,
         wechat_name = ?,
         game_name = ?,
         fan_group_level = ?,
         statuses_json = ?,
         is_public_in_balance_board = ?,
         public_name = ?,
         note = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      displayName,
      body.douyinName?.trim() || null,
      body.wechatName?.trim() || null,
      body.gameName?.trim() || null,
      body.fanGroupLevel?.trim() || null,
      JSON.stringify(statuses),
      body.isPublicInBalanceBoard ? 1 : 0,
      body.publicName?.trim() || null,
      body.note?.trim() || null,
      timestamp,
      fanId
    )
    .run();

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "update_fan",
    "fan",
    fanId,
    `编辑粉丝资料：${displayName}`,
    existing.streamer_id
  );

  return context.json({ ok: true });
});

app.get("/api/live-sessions", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const requestedStreamerId = context.req.query("streamerId");
  const { streamerId, streamers } = await resolveStreamerId(context.env.DB, account, requestedStreamerId);
  if (!streamerId) {
    return context.json({ items: [], streamers, activeStreamerId: null });
  }

  const status = context.req.query("status")?.trim();
  const statusFilter = normalizeSessionStatus(status) ?? null;
  const rows = await context.env.DB.prepare(
    `SELECT
       live_sessions.*,
       streamers.name AS streamer_name
     FROM live_sessions
     INNER JOIN streamers ON streamers.id = live_sessions.streamer_id
     WHERE live_sessions.streamer_id = ?
       AND (? IS NULL OR live_sessions.status = ?)
     ORDER BY live_sessions.created_at DESC`
  )
    .bind(streamerId, statusFilter, statusFilter)
    .all<LiveSessionRow>();

  return context.json({
    items: rows.results.map(toLiveSession),
    streamers,
    activeStreamerId: streamerId
  });
});

app.post("/api/live-sessions", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const body = await context.req.json<{
    streamerId?: string;
    title?: string;
    sessionType?: string;
    note?: string;
  }>();
  const { streamerId } = await resolveStreamerId(context.env.DB, account, body.streamerId);
  if (!streamerId) {
    return context.json(jsonError("没有可用的主播空间。"), 400);
  }

  const title = body.title?.trim();
  if (!title) {
    return context.json(jsonError("请填写场次标题。"), 400);
  }

  const sessionType = normalizeSessionType(body.sessionType);
  const timestamp = nowIso();
  const sessionId = createId("sesn");

  await context.env.DB.prepare(
    `INSERT INTO live_sessions
      (id, streamer_id, title, session_type, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'preparing', ?, ?, ?)`
  )
    .bind(sessionId, streamerId, title, sessionType, body.note?.trim() || null, timestamp, timestamp)
    .run();

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "create_live_session",
    "live_session",
    sessionId,
    `创建直播场次：${title}`,
    streamerId
  );

  return context.json({ ok: true, id: sessionId });
});

app.patch("/api/live-sessions/:sessionId", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const sessionId = context.req.param("sessionId");
  const existing = await context.env.DB.prepare(
    `SELECT
       live_sessions.*,
       streamers.name AS streamer_name
     FROM live_sessions
     INNER JOIN streamers ON streamers.id = live_sessions.streamer_id
     WHERE live_sessions.id = ?`
  )
    .bind(sessionId)
    .first<LiveSessionRow>();

  if (!existing) {
    return context.json(jsonError("场次不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, existing.streamer_id);
  if (streamerId !== existing.streamer_id) {
    return context.json(jsonError("没有权限编辑该场次。", 403), 403);
  }

  const body = await context.req.json<{
    title?: string;
    sessionType?: string;
    status?: string;
    note?: string;
  }>();

  const title = body.title?.trim();
  if (!title) {
    return context.json(jsonError("请填写场次标题。"), 400);
  }

  const status = normalizeSessionStatus(body.status);
  if (!status) {
    return context.json(jsonError("场次状态不正确。"), 400);
  }

  const sessionType = normalizeSessionType(body.sessionType);
  const timestamp = nowIso();
  const startedAt = status === "live" && !existing.started_at ? timestamp : existing.started_at;
  const endedAt =
    (status === "pending_settlement" || status === "settled" || status === "cancelled") && !existing.ended_at
      ? timestamp
      : existing.ended_at;
  const settledAt = status === "settled" && !existing.settled_at ? timestamp : existing.settled_at;

  await context.env.DB.prepare(
    `UPDATE live_sessions
     SET title = ?,
         session_type = ?,
         status = ?,
         started_at = ?,
         ended_at = ?,
         settled_at = ?,
         note = ?,
         updated_at = ?
     WHERE id = ?`
  )
    .bind(
      title,
      sessionType,
      status,
      startedAt,
      endedAt,
      settledAt,
      body.note?.trim() || null,
      timestamp,
      sessionId
    )
    .run();

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "update_live_session",
    "live_session",
    sessionId,
    `编辑直播场次：${title}，状态：${status}`,
    existing.streamer_id
  );

  return context.json({ ok: true });
});

app.get("/api/tickets", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const requestedStreamerId = context.req.query("streamerId");
  const { streamerId, streamers } = await resolveStreamerId(context.env.DB, account, requestedStreamerId);
  if (!streamerId) {
    return context.json({ items: [], fans: [], sessions: [], streamers, activeStreamerId: null });
  }

  const fanId = context.req.query("fanId")?.trim() || null;
  const rows = await context.env.DB.prepare(
    `SELECT
       ticket_ledgers.*,
       fans.display_name AS fan_name,
       live_sessions.title AS session_title,
       accounts.display_name AS created_by_name
     FROM ticket_ledgers
     INNER JOIN fans ON fans.id = ticket_ledgers.fan_id
     LEFT JOIN live_sessions ON live_sessions.id = ticket_ledgers.session_id
     LEFT JOIN accounts ON accounts.id = ticket_ledgers.created_by
     WHERE ticket_ledgers.streamer_id = ?
       AND (? IS NULL OR ticket_ledgers.fan_id = ?)
     ORDER BY ticket_ledgers.created_at DESC
     LIMIT 200`
  )
    .bind(streamerId, fanId, fanId)
    .all<TicketLedgerRow>();

  const fanRows = await context.env.DB.prepare(
    "SELECT * FROM fans WHERE streamer_id = ? ORDER BY updated_at DESC"
  )
    .bind(streamerId)
    .all<FanRow>();

  const sessionRows = await context.env.DB.prepare(
    `SELECT live_sessions.*, streamers.name AS streamer_name
     FROM live_sessions
     INNER JOIN streamers ON streamers.id = live_sessions.streamer_id
     WHERE live_sessions.streamer_id = ? AND live_sessions.status <> 'cancelled'
     ORDER BY live_sessions.created_at DESC
     LIMIT 30`
  )
    .bind(streamerId)
    .all<LiveSessionRow>();

  return context.json({
    items: rows.results.map(toTicketLedger),
    fans: fanRows.results.map(toFan),
    sessions: sessionRows.results.map(toLiveSession),
    streamers,
    activeStreamerId: streamerId
  });
});

app.post("/api/tickets", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const body = await context.req.json<{
    streamerId?: string;
    fanId?: string;
    sessionId?: string;
    rankingSnapshotId?: string;
    type?: string;
    amount?: number;
    note?: string;
  }>();
  const { streamerId } = await resolveStreamerId(context.env.DB, account, body.streamerId);
  if (!streamerId) {
    return context.json(jsonError("没有可用的主播空间。"), 400);
  }

  const type = normalizeTicketType(body.type);
  if (!type) {
    return context.json(jsonError("票务类型不正确。"), 400);
  }

  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount === 0) {
    return context.json(jsonError("票数必须是非零整数。"), 400);
  }
  if (type !== "adjustment" && amount < 0) {
    return context.json(jsonError("存票、取票和现刷票数必须大于 0。"), 400);
  }

  const fan = await context.env.DB.prepare("SELECT * FROM fans WHERE id = ? AND streamer_id = ?")
    .bind(body.fanId ?? "", streamerId)
    .first<FanRow>();
  if (!fan) {
    return context.json(jsonError("粉丝不存在或不属于当前主播。"), 400);
  }

  const statuses = parseStatuses(fan.statuses_json);
  if (statuses.includes("blacklisted")) {
    return context.json(jsonError("该粉丝已拉黑，不能新增票务记录。"), 400);
  }

  const currentBalance = await getFanTicketBalance(context.env.DB, fan.id);
  const nextBalance = currentBalance + ticketBalanceDelta(type, amount);
  if (ticketAffectsBalance(type) && nextBalance < 0) {
    return context.json(jsonError(`操作后余额会变为 ${nextBalance}，不能低于 0。`), 400);
  }

  const sessionId = body.sessionId?.trim() || null;
  if (sessionId) {
    const session = await context.env.DB.prepare("SELECT id FROM live_sessions WHERE id = ? AND streamer_id = ?")
      .bind(sessionId, streamerId)
      .first<{ id: string }>();
    if (!session) {
      return context.json(jsonError("场次不存在或不属于当前主播。"), 400);
    }
  }

  const rankingSnapshotId = body.rankingSnapshotId?.trim() || null;
  if (rankingSnapshotId) {
    const snapshot = await context.env.DB.prepare(
      `SELECT ranking_snapshots.id
       FROM ranking_snapshots
       INNER JOIN live_sessions ON live_sessions.id = ranking_snapshots.session_id
       WHERE ranking_snapshots.id = ? AND live_sessions.streamer_id = ?`
    )
      .bind(rankingSnapshotId, streamerId)
      .first<{ id: string }>();
    if (!snapshot) {
      return context.json(jsonError("定榜不存在或不属于当前主播。"), 400);
    }
  }

  const ledgerId = createId("tkt");
  const timestamp = nowIso();
  await context.env.DB.prepare(
    `INSERT INTO ticket_ledgers
      (id, streamer_id, fan_id, session_id, ranking_snapshot_id, type, amount, affects_balance, affects_competition,
       status, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal', ?, ?, ?)`
  )
    .bind(
      ledgerId,
      streamerId,
      fan.id,
      sessionId,
      rankingSnapshotId,
      type,
      amount,
      ticketAffectsBalance(type) ? 1 : 0,
      ticketAffectsCompetition(type) ? 1 : 0,
      body.note?.trim() || null,
      account.id,
      timestamp
    )
    .run();

  if (ticketAffectsBalance(type)) {
    await refreshFanTicketBalance(context.env.DB, fan.id);
  }

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "create_ticket_ledger",
    "ticket_ledger",
    ledgerId,
    `新增票务记录：${fan.display_name} ${type} ${amount}`,
    streamerId
  );

  return context.json({ ok: true, id: ledgerId, balanceDelta: ticketBalanceDelta(type, amount) });
});

app.post("/api/tickets/:ledgerId/void", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const ledgerId = context.req.param("ledgerId");
  const existing = await context.env.DB.prepare("SELECT * FROM ticket_ledgers WHERE id = ?")
    .bind(ledgerId)
    .first<{
      id: string;
      streamer_id: string;
      fan_id: string;
      status: string;
      type: string;
      amount: number;
    }>();
  if (!existing) {
    return context.json(jsonError("票务记录不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, existing.streamer_id);
  if (streamerId !== existing.streamer_id) {
    return context.json(jsonError("没有权限作废该记录。", 403), 403);
  }
  if (existing.status === "voided") {
    return context.json(jsonError("该记录已经作废。"), 400);
  }

  const currentBalance = await getFanTicketBalance(context.env.DB, existing.fan_id);
  const nextBalance = currentBalance - ticketBalanceDelta(existing.type, existing.amount);
  if (ticketAffectsBalance(existing.type) && nextBalance < 0) {
    return context.json(jsonError(`作废后余额会变为 ${nextBalance}，不能低于 0。`), 400);
  }

  const body = await context.req.json<{ note?: string }>();
  const timestamp = nowIso();
  await context.env.DB.prepare(
    "UPDATE ticket_ledgers SET status = 'voided', voided_by = ?, voided_at = ?, note = ? WHERE id = ?"
  )
    .bind(account.id, timestamp, body.note?.trim() || "作废记录", ledgerId)
    .run();

  if (ticketAffectsBalance(existing.type)) {
    await refreshFanTicketBalance(context.env.DB, existing.fan_id);
  }

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "void_ticket_ledger",
    "ticket_ledger",
    ledgerId,
    `作废票务记录：${existing.type} ${existing.amount}`,
    existing.streamer_id
  );

  return context.json({ ok: true });
});

app.get("/api/session-board", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const sessionId = context.req.query("sessionId")?.trim();
  if (!sessionId) {
    return context.json(jsonError("请选择场次。"), 400);
  }

  const session = await context.env.DB.prepare(
    `SELECT live_sessions.*, streamers.name AS streamer_name
     FROM live_sessions
     INNER JOIN streamers ON streamers.id = live_sessions.streamer_id
     WHERE live_sessions.id = ?`
  )
    .bind(sessionId)
    .first<LiveSessionRow>();
  if (!session) {
    return context.json(jsonError("场次不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, session.streamer_id);
  if (streamerId !== session.streamer_id) {
    return context.json(jsonError("没有权限查看该场次。", 403), 403);
  }

  await autoFreezeDueRankings(context.env.DB, sessionId);

  const entries = await context.env.DB.prepare(
    `SELECT
       live_session_board_entries.*,
       fans.display_name,
       fans.douyin_name,
       fans.statuses_json,
       fans.cached_ticket_balance
     FROM live_session_board_entries
     INNER JOIN fans ON fans.id = live_session_board_entries.fan_id
     WHERE live_session_board_entries.session_id = ?
     ORDER BY
       CASE live_session_board_entries.status
         WHEN 'normal' THEN 1
         WHEN 'new_fan' THEN 2
         WHEN 'pending' THEN 3
         WHEN 'away' THEN 4
         WHEN 'blocked' THEN 5
         ELSE 6
       END,
       (live_session_board_entries.gift_diamonds + live_session_board_entries.ticket_used
        - live_session_board_entries.ticket_deposit + live_session_board_entries.manual_adjustment) DESC,
       live_session_board_entries.tie_order ASC,
       live_session_board_entries.updated_at ASC`
  )
    .bind(sessionId)
    .all<LiveSessionBoardEntryRow>();

  const fans = await context.env.DB.prepare("SELECT * FROM fans WHERE streamer_id = ? ORDER BY updated_at DESC")
    .bind(streamerId)
    .all<FanRow>();

  const snapshots = await context.env.DB.prepare(
    `SELECT
       ranking_snapshots.*,
       live_sessions.title AS session_title,
       live_sessions.streamer_id AS streamer_id
     FROM ranking_snapshots
     INNER JOIN live_sessions ON live_sessions.id = ranking_snapshots.session_id
     WHERE ranking_snapshots.session_id = ?
     ORDER BY ranking_snapshots.round_no DESC, ranking_snapshots.created_at DESC`
  )
    .bind(sessionId)
    .all<RankingSnapshotRow>();

  return context.json({
    session: toLiveSession(session),
    entries: entries.results.map(toBoardEntry),
    fans: fans.results.map(toFan),
    snapshots: snapshots.results.map(toRankingSnapshot)
  });
});

app.post("/api/session-board/entries", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const body = await context.req.json<{
    sessionId?: string;
    fanId?: string;
    giftDiamonds?: number;
    ticketUsed?: number;
    ticketDeposit?: number;
    manualAdjustment?: number;
    status?: string;
    tieOrder?: number;
    note?: string;
  }>();

  const session = await context.env.DB.prepare("SELECT * FROM live_sessions WHERE id = ?")
    .bind(body.sessionId ?? "")
    .first<LiveSessionRow>();
  if (!session) {
    return context.json(jsonError("场次不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, session.streamer_id);
  if (streamerId !== session.streamer_id) {
    return context.json(jsonError("没有权限编辑该场次。", 403), 403);
  }

  const fan = await context.env.DB.prepare("SELECT * FROM fans WHERE id = ? AND streamer_id = ?")
    .bind(body.fanId ?? "", streamerId)
    .first<FanRow>();
  if (!fan) {
    return context.json(jsonError("粉丝不存在或不属于当前主播。"), 400);
  }

  const giftDiamonds = Number(body.giftDiamonds ?? 0);
  const ticketUsed = Number(body.ticketUsed ?? 0);
  const ticketDeposit = Number(body.ticketDeposit ?? 0);
  const manualAdjustment = Number(body.manualAdjustment ?? 0);
  const tieOrder = Number(body.tieOrder ?? 0);
  if (![giftDiamonds, ticketUsed, ticketDeposit, manualAdjustment, tieOrder].every(Number.isInteger)) {
    return context.json(jsonError("票数字段必须是整数。"), 400);
  }
  if (giftDiamonds < 0 || ticketUsed < 0 || ticketDeposit < 0) {
    return context.json(jsonError("礼物钻、取票和存票不能小于 0。"), 400);
  }

  const existing = await context.env.DB.prepare(
    "SELECT * FROM live_session_board_entries WHERE session_id = ? AND fan_id = ?"
  )
    .bind(session.id, fan.id)
    .first<{
      id: string;
      gift_diamonds: number;
      ticket_used: number;
      ticket_deposit: number;
      manual_adjustment: number;
    }>();
  const oldTicketUsed = existing?.ticket_used ?? 0;
  const oldTicketDeposit = existing?.ticket_deposit ?? 0;
  const withdrawDelta = ticketUsed - oldTicketUsed;
  const depositDelta = ticketDeposit - oldTicketDeposit;
  const status = normalizeBoardStatus(body.status);
  const fanStatuses = parseStatuses(fan.statuses_json);
  const finalStatus = fanStatuses.includes("blacklisted") ? "blocked" : status;
  const currentBalance = await getFanTicketBalance(context.env.DB, fan.id);
  const nextBalance = currentBalance - withdrawDelta + depositDelta;
  if (nextBalance < 0) {
    return context.json(jsonError(`结算后余额会变为 ${nextBalance}，不能低于 0。`), 400);
  }
  const timestamp = nowIso();

  if (existing) {
    await context.env.DB.prepare(
      `UPDATE live_session_board_entries
       SET gift_diamonds = ?, ticket_used = ?, ticket_deposit = ?, manual_adjustment = ?,
           status = ?, tie_order = ?, note = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        giftDiamonds,
        ticketUsed,
        ticketDeposit,
        manualAdjustment,
        finalStatus,
        tieOrder,
        body.note?.trim() || null,
        timestamp,
        existing.id
      )
      .run();
  } else {
    await context.env.DB.prepare(
      `INSERT INTO live_session_board_entries
        (id, session_id, fan_id, gift_diamonds, ticket_used, ticket_deposit, manual_adjustment,
         status, tie_order, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        createId("board"),
        session.id,
        fan.id,
        giftDiamonds,
        ticketUsed,
        ticketDeposit,
        manualAdjustment,
        finalStatus,
        tieOrder,
        body.note?.trim() || null,
        timestamp,
        timestamp
      )
      .run();
  }

  const ticketWrites = [];

  if (withdrawDelta !== 0) {
    ticketWrites.push(
      context.env.DB
        .prepare(
          `INSERT INTO ticket_ledgers
            (id, streamer_id, fan_id, session_id, type, amount, affects_balance, affects_competition,
             status, note, created_by, created_at)
           VALUES (?, ?, ?, ?, 'withdraw', ?, 1, 1, 'normal', ?, ?, ?)`
        )
        .bind(
          createId("tkt"),
          streamerId,
          fan.id,
          session.id,
          withdrawDelta,
          `本场榜单取票变化：${body.note?.trim() || "无备注"}`,
          account.id,
          timestamp
        )
    );
  }

  if (depositDelta !== 0) {
    ticketWrites.push(
      context.env.DB
        .prepare(
          `INSERT INTO ticket_ledgers
            (id, streamer_id, fan_id, session_id, type, amount, affects_balance, affects_competition,
             status, note, created_by, created_at)
           VALUES (?, ?, ?, ?, 'deposit', ?, 1, 0, 'normal', ?, ?, ?)`
        )
        .bind(
          createId("tkt"),
          streamerId,
          fan.id,
          session.id,
          depositDelta,
          `本场榜单存票变化：${body.note?.trim() || "无备注"}`,
          account.id,
          timestamp
        )
    );
  }

  if (ticketWrites.length > 0) {
    await context.env.DB.batch(ticketWrites);
    await refreshFanTicketBalance(context.env.DB, fan.id);
  }

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "upsert_session_board_entry",
    "live_session_board_entry",
    fan.id,
    `更新本场榜单：${fan.display_name} 总票 ${giftDiamonds + ticketUsed - ticketDeposit + manualAdjustment}`,
    streamerId
  );

  return context.json({ ok: true });
});

app.get("/api/rankings", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const requestedStreamerId = context.req.query("streamerId");
  const { streamerId, streamers } = await resolveStreamerId(context.env.DB, account, requestedStreamerId);
  if (!streamerId) {
    return context.json({ snapshots: [], entries: [], sessions: [], fans: [], streamers, activeStreamerId: null });
  }

  const selectedSnapshotId = context.req.query("snapshotId")?.trim() || null;
  const sessionRows = await context.env.DB.prepare(
    `SELECT live_sessions.*, streamers.name AS streamer_name
     FROM live_sessions
     INNER JOIN streamers ON streamers.id = live_sessions.streamer_id
     WHERE live_sessions.streamer_id = ? AND live_sessions.status <> 'cancelled'
     ORDER BY live_sessions.created_at DESC
     LIMIT 30`
  )
    .bind(streamerId)
    .all<LiveSessionRow>();

  const fanRows = await context.env.DB.prepare("SELECT * FROM fans WHERE streamer_id = ? ORDER BY updated_at DESC")
    .bind(streamerId)
    .all<FanRow>();

  const snapshotRows = await context.env.DB.prepare(
    `SELECT
       ranking_snapshots.*,
       live_sessions.title AS session_title,
       live_sessions.streamer_id AS streamer_id
     FROM ranking_snapshots
     INNER JOIN live_sessions ON live_sessions.id = ranking_snapshots.session_id
     WHERE live_sessions.streamer_id = ?
     ORDER BY ranking_snapshots.created_at DESC
     LIMIT 50`
  )
    .bind(streamerId)
    .all<RankingSnapshotRow>();

  const activeSnapshotId =
    selectedSnapshotId && snapshotRows.results.some((snapshot) => snapshot.id === selectedSnapshotId)
      ? selectedSnapshotId
      : snapshotRows.results[0]?.id || null;
  const entryRows = activeSnapshotId
    ? await context.env.DB.prepare(
        `SELECT *
         FROM ranking_entries
         WHERE ranking_snapshot_id = ?
         ORDER BY
          CASE seat_decision
            WHEN 'recommended' THEN 1
            WHEN 'waitlist' THEN 2
            WHEN 'away' THEN 3
            WHEN 'blocked' THEN 4
            ELSE 5
          END,
           competition_score DESC,
           rank_order ASC`
      )
        .bind(activeSnapshotId)
        .all<RankingEntryRow>()
    : { results: [] as RankingEntryRow[] };

  return context.json({
    snapshots: snapshotRows.results.map(toRankingSnapshot),
    entries: entryRows.results.map(toRankingEntry),
    sessions: sessionRows.results.map(toLiveSession),
    fans: fanRows.results.map(toFan),
    streamers,
    activeStreamerId: streamerId,
    activeSnapshotId
  });
});

app.post("/api/rankings", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const body = await context.req.json<{
    streamerId?: string;
    sessionId?: string;
    roundNo?: number;
    title?: string;
    style?: string;
    note?: string;
  }>();
  const { streamerId } = await resolveStreamerId(context.env.DB, account, body.streamerId);
  if (!streamerId) {
    return context.json(jsonError("没有可用的主播空间。"), 400);
  }

  const session = await context.env.DB.prepare("SELECT * FROM live_sessions WHERE id = ? AND streamer_id = ?")
    .bind(body.sessionId ?? "", streamerId)
    .first<LiveSessionRow>();
  if (!session) {
    return context.json(jsonError("请选择有效场次。"), 400);
  }

  const style = normalizeRankingStyle(body.style);
  const roundRow = await context.env.DB.prepare("SELECT COALESCE(MAX(round_no), 0) + 1 AS nextRound FROM ranking_snapshots WHERE session_id = ?")
    .bind(session.id)
    .first<{ nextRound: number }>();
  const requestedRoundNo = Number(body.roundNo);
  const roundNo = Number.isInteger(requestedRoundNo) && requestedRoundNo > 0 ? requestedRoundNo : roundRow?.nextRound ?? 1;
  const title = body.title?.trim() || `第 ${roundNo} 次定榜`;
  const snapshotId = createId("rank");
  const timestamp = nowIso();

  await context.env.DB.prepare(
    `INSERT INTO ranking_snapshots
      (id, session_id, title, round_no, style, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
  )
    .bind(snapshotId, session.id, title || `第 ${roundNo} 次定榜`, roundNo, style, body.note?.trim() || null, timestamp, timestamp)
    .run();

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "create_ranking_snapshot",
    "ranking_snapshot",
    snapshotId,
    `创建定榜：${title}`,
    streamerId
  );

  return context.json({ ok: true, id: snapshotId });
});

app.patch("/api/rankings/:snapshotId/status", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const snapshotId = context.req.param("snapshotId");
  const snapshot = await context.env.DB.prepare(
    `SELECT
       ranking_snapshots.*,
       live_sessions.title AS session_title,
       live_sessions.streamer_id AS streamer_id
     FROM ranking_snapshots
     INNER JOIN live_sessions ON live_sessions.id = ranking_snapshots.session_id
     WHERE ranking_snapshots.id = ?`
  )
    .bind(snapshotId)
    .first<RankingSnapshotRow>();
  if (!snapshot) {
    return context.json(jsonError("定榜不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, snapshot.streamer_id);
  if (streamerId !== snapshot.streamer_id) {
    return context.json(jsonError("没有权限操作该定榜。", 403), 403);
  }

  const body = await context.req.json<{ action?: string; seconds?: number }>();
  const action = body.action;
  const timestamp = nowIso();

  if (action === "start_countdown") {
    const seconds = Number.isInteger(body.seconds) && body.seconds && body.seconds > 0 ? body.seconds : 180;
    const endsAt = new Date(Date.now() + seconds * 1000).toISOString();
    await context.env.DB.prepare(
      `UPDATE ranking_snapshots
       SET status = 'countdown', countdown_seconds = ?, countdown_started_at = ?, countdown_ends_at = ?, frozen_at = NULL, updated_at = ?
       WHERE id = ?`
    )
      .bind(seconds, timestamp, endsAt, timestamp, snapshotId)
      .run();

    await writeAuditLog(
      context.env.DB,
      toPublicAccount(account),
      "start_ranking_countdown",
      "ranking_snapshot",
      snapshotId,
      `开始定榜倒计时：${snapshot.title}`,
      streamerId
    );
    return context.json({ ok: true, countdownStartedAt: timestamp, countdownEndsAt: endsAt });
  }

  if (action === "freeze") {
    await replaceRankingEntriesFromBoard(context.env.DB, snapshot);
    await context.env.DB.prepare(
      "UPDATE ranking_snapshots SET status = 'frozen', frozen_at = ?, updated_at = ? WHERE id = ?"
    )
      .bind(timestamp, timestamp, snapshotId)
      .run();

    await writeAuditLog(
      context.env.DB,
      toPublicAccount(account),
      "freeze_ranking_snapshot",
      "ranking_snapshot",
      snapshotId,
      `冻结定榜结果：${snapshot.title}`,
      streamerId
    );
    return context.json({ ok: true, frozenAt: timestamp });
  }

  if (action === "reopen") {
    await context.env.DB.prepare(
      `UPDATE ranking_snapshots
       SET status = 'draft', countdown_started_at = NULL, countdown_ends_at = NULL, frozen_at = NULL, updated_at = ?
       WHERE id = ?`
    )
      .bind(timestamp, snapshotId)
      .run();

    await writeAuditLog(
      context.env.DB,
      toPublicAccount(account),
      "reopen_ranking_snapshot",
      "ranking_snapshot",
      snapshotId,
      `重新打开定榜：${snapshot.title}`,
      streamerId
    );
    return context.json({ ok: true });
  }

  return context.json(jsonError("未知的定榜状态操作。"), 400);
});

app.post("/api/rankings/:snapshotId/entries", async (context) => {
  const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
  if (!account) {
    return context.json(jsonError("请先登录。", 401), 401);
  }

  const snapshotId = context.req.param("snapshotId");
  const snapshot = await context.env.DB.prepare(
    `SELECT
       ranking_snapshots.*,
       live_sessions.title AS session_title,
       live_sessions.streamer_id AS streamer_id
     FROM ranking_snapshots
     INNER JOIN live_sessions ON live_sessions.id = ranking_snapshots.session_id
     WHERE ranking_snapshots.id = ?`
  )
    .bind(snapshotId)
    .first<RankingSnapshotRow>();
  if (!snapshot) {
    return context.json(jsonError("定榜不存在。", 404), 404);
  }

  const { streamerId } = await resolveStreamerId(context.env.DB, account, snapshot.streamer_id);
  if (streamerId !== snapshot.streamer_id) {
    return context.json(jsonError("没有权限编辑该定榜。", 403), 403);
  }
  if (snapshot.status === "frozen") {
    return context.json(jsonError("该定榜已冻结，不能继续编辑榜单。"), 400);
  }

  const body = await context.req.json<{
    fanId?: string;
    rankOrder?: number;
    giftDiamonds?: number;
    ticketUsed?: number;
    manualAdjustment?: number;
    seatDecision?: string;
    note?: string;
  }>();

  const fan = await context.env.DB.prepare("SELECT * FROM fans WHERE id = ? AND streamer_id = ?")
    .bind(body.fanId ?? "", streamerId)
    .first<FanRow>();
  if (!fan) {
    return context.json(jsonError("粉丝不存在或不属于当前主播。"), 400);
  }

  const rankOrder = Number(body.rankOrder);
  const giftDiamonds = Number(body.giftDiamonds ?? 0);
  const ticketUsed = Number(body.ticketUsed ?? 0);
  const manualAdjustment = Number(body.manualAdjustment ?? 0);
  if (!Number.isInteger(rankOrder) || rankOrder < 1) {
    return context.json(jsonError("名次必须是大于 0 的整数。"), 400);
  }
  if (![giftDiamonds, ticketUsed, manualAdjustment].every(Number.isInteger)) {
    return context.json(jsonError("礼物钻、取票和调整必须是整数。"), 400);
  }
  if (giftDiamonds < 0 || ticketUsed < 0) {
    return context.json(jsonError("礼物钻和取票不能小于 0。"), 400);
  }

  const statuses = parseStatuses(fan.statuses_json);
  const competitionScore = giftDiamonds + ticketUsed + manualAdjustment;
  const initialSeatDecision = statuses.includes("blacklisted") ? "blocked" : normalizeSeatDecision(body.seatDecision);
  const existing = await context.env.DB.prepare("SELECT id FROM ranking_entries WHERE ranking_snapshot_id = ? AND fan_id = ?")
    .bind(snapshotId, fan.id)
    .first<{ id: string }>();
  const timestamp = nowIso();

  if (existing) {
    await context.env.DB.prepare(
      `UPDATE ranking_entries
       SET display_name_at_time = ?, douyin_name_at_time = ?, rank_order = ?, gift_diamonds = ?,
           ticket_used = ?, manual_adjustment = ?, competition_score = ?, fan_type_at_time = ?,
           seat_decision = ?, note = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        fan.display_name,
        fan.douyin_name,
        rankOrder,
        giftDiamonds,
        ticketUsed,
        manualAdjustment,
        competitionScore,
        fanTypeFromStatuses(statuses),
        initialSeatDecision,
        body.note?.trim() || null,
        timestamp,
        existing.id
      )
      .run();
  } else {
    await context.env.DB.prepare(
      `INSERT INTO ranking_entries
        (id, ranking_snapshot_id, fan_id, display_name_at_time, douyin_name_at_time, rank_order,
         gift_diamonds, ticket_used, manual_adjustment, competition_score, fan_type_at_time,
         seat_decision, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        createId("rent"),
        snapshotId,
        fan.id,
        fan.display_name,
        fan.douyin_name,
        rankOrder,
        giftDiamonds,
        ticketUsed,
        manualAdjustment,
        competitionScore,
        fanTypeFromStatuses(statuses),
        initialSeatDecision,
        body.note?.trim() || null,
        timestamp,
        timestamp
      )
      .run();
  }

  await recomputeRankingDecisions(context.env.DB, snapshotId, snapshot.style);

  await writeAuditLog(
    context.env.DB,
    toPublicAccount(account),
    "upsert_ranking_entry",
    "ranking_snapshot",
    snapshotId,
    `录入榜单条目：${fan.display_name} 总票数 ${competitionScore}`,
    streamerId
  );

  return context.json({ ok: true });
});

app.notFound((context) => context.json({ error: "Not found" }, 404));

export default app;
