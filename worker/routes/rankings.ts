import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings, FanRow, LiveSessionRow, RankingEntryRow, RankingSnapshotRow } from "../shared";
import {
  createId,
  fanTypeFromStatuses,
  getCurrentAccount,
  jsonError,
  normalizeRankingStyle,
  normalizeSeatDecision,
  nowIso,
  parseStatuses,
  recomputeRankingDecisions,
  replaceRankingEntriesFromBoard,
  resolveStreamerId,
  sessionCookieName,
  toFan,
  toLiveSession,
  toPublicAccount,
  toRankingEntry,
  toRankingSnapshot,
  writeAuditLog
} from "../shared";

type WorkerApp = Hono<{ Bindings: Bindings }>;

export function registerRankingRoutes(app: WorkerApp) {
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
}
