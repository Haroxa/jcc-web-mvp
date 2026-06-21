import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings, FanRow, LiveSessionBoardEntryRow, LiveSessionRow, RankingSnapshotRow } from "../shared";
import {
  autoFreezeDueRankings,
  createId,
  getCurrentAccount,
  getFanTicketBalance,
  jsonError,
  normalizeBoardStatus,
  nowIso,
  parseStatuses,
  resolveStreamerId,
  sessionCookieName,
  toBoardEntry,
  toFan,
  toLiveSession,
  toPublicAccount,
  toRankingSnapshot,
  writeAuditLog
} from "../shared";

type WorkerApp = Hono<{ Bindings: Bindings }>;

export function registerSessionBoardRoutes(app: WorkerApp) {
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
         fans.cached_ticket_balance,
         COALESCE(ledger_totals.settled_withdraw, 0) AS settled_withdraw,
         COALESCE(ledger_totals.settled_deposit, 0) AS settled_deposit
       FROM live_session_board_entries
       INNER JOIN fans ON fans.id = live_session_board_entries.fan_id
       LEFT JOIN (
         SELECT
           fan_id,
           SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END) AS settled_withdraw,
           SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS settled_deposit
         FROM ticket_ledgers
         WHERE session_id = ? AND status = 'normal' AND type IN ('withdraw', 'deposit')
         GROUP BY fan_id
       ) ledger_totals ON ledger_totals.fan_id = live_session_board_entries.fan_id
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
      .bind(sessionId, sessionId)
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
    if (session.status === "settled" || session.status === "cancelled") {
      return context.json(jsonError("已结算或已取消的场次不能继续编辑本场榜单。"), 400);
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
    const status = normalizeBoardStatus(body.status);
    const fanStatuses = parseStatuses(fan.statuses_json);
    const finalStatus = fanStatuses.includes("blacklisted") ? "blocked" : status;
    const currentBalance = await getFanTicketBalance(context.env.DB, fan.id);
    const bookedRows = await context.env.DB.prepare(
      `SELECT type, COALESCE(SUM(amount), 0) AS amount
       FROM ticket_ledgers
       WHERE session_id = ? AND fan_id = ? AND status = 'normal' AND type IN ('withdraw', 'deposit')
       GROUP BY type`
    )
      .bind(session.id, fan.id)
      .all<{ type: string; amount: number }>();
    const bookedWithdraw = bookedRows.results.find((row) => row.type === "withdraw")?.amount ?? 0;
    const bookedDeposit = bookedRows.results.find((row) => row.type === "deposit")?.amount ?? 0;
    const projectedBalance = currentBalance - (ticketUsed - bookedWithdraw) + (ticketDeposit - bookedDeposit);
    if (projectedBalance < 0) {
      return context.json(jsonError(`结算后余额会变为 ${projectedBalance}，不能低于 0。`), 400);
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
  
    await writeAuditLog(
      context.env.DB,
      toPublicAccount(account),
      "upsert_session_board_entry",
      "live_session_board_entry",
      fan.id,
      `更新本场榜单草稿：${fan.display_name} 总票 ${giftDiamonds + ticketUsed - ticketDeposit + manualAdjustment}`,
      streamerId
    );
  
    return context.json({ ok: true });
  });
}
