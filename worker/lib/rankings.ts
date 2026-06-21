import type { LiveSessionBoardEntryRow, RankingEntryRow, RankingSnapshotRow } from "./types";
import { createId, nowIso } from "./core";
import { parseStatuses } from "./fans";

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
  const settledWithdraw = row.settled_withdraw ?? 0;
  const settledDeposit = row.settled_deposit ?? 0;
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
    balancePreview: row.cached_ticket_balance - (row.ticket_used - settledWithdraw) + (row.ticket_deposit - settledDeposit),
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
