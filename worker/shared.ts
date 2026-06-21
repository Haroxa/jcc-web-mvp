export type Bindings = {
  DB: D1Database;
  SCREENSHOTS?: R2Bucket;
  ADMIN_SETUP_TOKEN?: string;
};


export const sessionCookieName = "jcc_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type AccountRow = {
  id: string;
  role: string;
  streamer_id: string | null;
  username: string;
  password_hash: string;
  display_name: string;
  status: string;
  active_session_id: string | null;
};

export type PublicAccount = {
  id: string;
  role: string;
  streamerId: string | null;
  username: string;
  displayName: string;
};

export type StreamerAccountRow = {
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

export type FanRow = {
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

export type LiveSessionRow = {
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

export type TicketLedgerRow = {
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

export type RankingSnapshotRow = {
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

export type RankingEntryRow = {
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

export type LiveSessionBoardEntryRow = {
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

export type StreamerOptionRow = {
  id: string;
  name: string;
};

export function jsonError(message: string, status = 400) {
  return { error: message, status };
}

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createPassword(length = 16) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => chars[byte % chars.length]).join("");
}

export function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function sha256(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function hashPassword(password: string, salt = crypto.randomUUID()) {
  return `sha256_salted$${salt}$${await sha256(`${salt}:${password}`)}`;
}

export async function verifyPassword(password: string, storedHash: string) {
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

export function toPublicAccount(account: AccountRow): PublicAccount {
  return {
    id: account.id,
    role: account.role,
    streamerId: account.streamer_id,
    username: account.username,
    displayName: account.display_name
  };
}

export async function countAccounts(db: D1Database) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM accounts").first<{ count: number }>();
  return row?.count ?? 0;
}

export async function writeAuditLog(
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

export async function getCurrentAccount(db: D1Database, token?: string) {
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

export function toStreamerAccount(row: StreamerAccountRow) {
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

export function parseStatuses(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeStatuses(statuses?: string[]) {
  const allowed = new Set(["new_fan", "old_fan", "manager", "violated", "blacklisted"]);
  return [...new Set((statuses ?? []).filter((status) => allowed.has(status)))];
}

export function toFan(row: FanRow) {
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

export function normalizeSessionType(value?: string) {
  const allowed = new Set(["afternoon", "evening", "custom"]);
  return value && allowed.has(value) ? value : "custom";
}

export function normalizeSessionStatus(value?: string) {
  const allowed = new Set(["preparing", "live", "pending_settlement", "settled", "cancelled"]);
  return value && allowed.has(value) ? value : null;
}

export function toLiveSession(row: LiveSessionRow) {
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

export function normalizeTicketType(value?: string) {
  const allowed = new Set(["deposit", "withdraw", "gift", "adjustment"]);
  return value && allowed.has(value) ? value : null;
}

export function ticketBalanceDelta(type: string, amount: number) {
  if (type === "deposit" || type === "adjustment") return amount;
  if (type === "withdraw") return -amount;
  return 0;
}

export function ticketAffectsBalance(type: string) {
  return type === "deposit" || type === "withdraw" || type === "adjustment";
}

export function ticketAffectsCompetition(type: string) {
  return type === "withdraw" || type === "gift";
}

export async function getFanTicketBalance(db: D1Database, fanId: string) {
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

export function toTicketLedger(row: TicketLedgerRow) {
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

export function normalizeRankingStyle(value?: string) {
  const allowed = new Set(["top5", "top7"]);
  return value && allowed.has(value) ? value : "top7";
}

export function rankingSeatLimit(style: string) {
  return style === "top5" ? 5 : 7;
}

export function normalizeSeatDecision(value?: string) {
  const allowed = new Set(["waitlist", "away"]);
  return value && allowed.has(value) ? value : "waitlist";
}

export function normalizeBoardStatus(value?: string) {
  const allowed = new Set(["normal", "new_fan", "away", "pending", "blocked"]);
  return value && allowed.has(value) ? value : "normal";
}

export function boardCompetitionScore(row: {
  gift_diamonds: number;
  ticket_used: number;
  ticket_deposit: number;
  manual_adjustment: number;
}) {
  return row.gift_diamonds + row.ticket_used - row.ticket_deposit + row.manual_adjustment;
}

export function boardStatusToSeatDecision(status: string) {
  if (status === "away") return "away";
  if (status === "blocked") return "blocked";
  return "waitlist";
}

export function fanTypeFromStatuses(statuses: string[]) {
  if (statuses.includes("new_fan")) return "new_fan";
  if (statuses.includes("old_fan")) return "old_fan";
  return "unknown";
}

export function toRankingSnapshot(row: RankingSnapshotRow) {
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

export function toRankingEntry(row: RankingEntryRow) {
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

export function toBoardEntry(row: LiveSessionBoardEntryRow) {
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

export async function recomputeRankingDecisions(db: D1Database, snapshotId: string, style: string) {
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

export async function replaceRankingEntriesFromBoard(db: D1Database, snapshot: RankingSnapshotRow) {
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

export async function autoFreezeDueRankings(db: D1Database, sessionId: string) {
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

export async function refreshFanTicketBalance(db: D1Database, fanId: string) {
  const balance = await getFanTicketBalance(db, fanId);

  await db
    .prepare("UPDATE fans SET cached_ticket_balance = ?, updated_at = ? WHERE id = ?")
    .bind(balance, nowIso(), fanId)
    .run();
}

export async function listAccessibleStreamers(db: D1Database, account: AccountRow) {
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

export async function resolveStreamerId(db: D1Database, account: AccountRow, requestedStreamerId?: string | null) {
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
