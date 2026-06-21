import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings, FanRow, LiveSessionRow, TicketLedgerRow } from "../shared";
import {
  createId,
  getCurrentAccount,
  getFanTicketBalance,
  jsonError,
  normalizeTicketType,
  nowIso,
  parseStatuses,
  refreshFanTicketBalance,
  resolveStreamerId,
  sessionCookieName,
  ticketAffectsBalance,
  ticketAffectsCompetition,
  ticketBalanceDelta,
  toFan,
  toLiveSession,
  toPublicAccount,
  toTicketLedger,
  writeAuditLog
} from "../shared";

type WorkerApp = Hono<{ Bindings: Bindings }>;

export function registerTicketRoutes(app: WorkerApp) {
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
}
