import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings, LiveSessionRow } from "../shared";
import {
  createId,
  getCurrentAccount,
  jsonError,
  normalizeSessionStatus,
  normalizeSessionType,
  nowIso,
  refreshFanTicketBalance,
  resolveStreamerId,
  sessionCookieName,
  toLiveSession,
  toPublicAccount,
  writeAuditLog
} from "../shared";

type WorkerApp = Hono<{ Bindings: Bindings }>;

export function registerLiveSessionRoutes(app: WorkerApp) {
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
  
  app.post("/api/live-sessions/:sessionId/action", async (context) => {
    const account = await getCurrentAccount(context.env.DB, getCookie(context, sessionCookieName));
    if (!account) {
      return context.json(jsonError("请先登录。", 401), 401);
    }
  
    const sessionId = context.req.param("sessionId");
    const session = await context.env.DB.prepare("SELECT * FROM live_sessions WHERE id = ?")
      .bind(sessionId)
      .first<LiveSessionRow>();
    if (!session) {
      return context.json(jsonError("场次不存在。", 404), 404);
    }
  
    const { streamerId } = await resolveStreamerId(context.env.DB, account, session.streamer_id);
    if (streamerId !== session.streamer_id) {
      return context.json(jsonError("没有权限操作该场次。", 403), 403);
    }
  
    const body = await context.req.json<{ action?: string }>();
    const action = body.action;
    const timestamp = nowIso();
  
    if (action === "start") {
      if (session.status !== "preparing") {
        return context.json(jsonError("只有准备中的场次可以开始直播。"), 400);
      }
  
      await context.env.DB.prepare(
        "UPDATE live_sessions SET status = 'live', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?"
      )
        .bind(timestamp, timestamp, session.id)
        .run();
  
      await writeAuditLog(
        context.env.DB,
        toPublicAccount(account),
        "start_live_session",
        "live_session",
        session.id,
        `开始直播场次：${session.title}`,
        streamerId
      );
  
      return context.json({ ok: true });
    }
  
    if (action === "end") {
      if (session.status !== "live") {
        return context.json(jsonError("只有进行中的场次可以结束直播。"), 400);
      }
  
      await context.env.DB.prepare(
        "UPDATE live_sessions SET status = 'pending_settlement', ended_at = COALESCE(ended_at, ?), updated_at = ? WHERE id = ?"
      )
        .bind(timestamp, timestamp, session.id)
        .run();
  
      await writeAuditLog(
        context.env.DB,
        toPublicAccount(account),
        "end_live_session",
        "live_session",
        session.id,
        `结束直播场次：${session.title}`,
        streamerId
      );
  
      return context.json({ ok: true });
    }
  
    if (action === "settle") {
      if (session.status !== "pending_settlement") {
        return context.json(jsonError("只有待结算场次可以确认结算。"), 400);
      }
  
      const boardRows = await context.env.DB.prepare(
        `SELECT
           live_session_board_entries.*,
           fans.cached_ticket_balance
         FROM live_session_board_entries
         INNER JOIN fans ON fans.id = live_session_board_entries.fan_id
         WHERE live_session_board_entries.session_id = ?`
      )
        .bind(session.id)
        .all<
          {
            fan_id: string;
            ticket_used: number;
            ticket_deposit: number;
            cached_ticket_balance: number;
          }
        >();
  
      const existingLedgers = await context.env.DB.prepare(
        `SELECT fan_id, type, COALESCE(SUM(amount), 0) AS amount
         FROM ticket_ledgers
         WHERE session_id = ?
           AND status = 'normal'
           AND type IN ('withdraw', 'deposit')
         GROUP BY fan_id, type`
      )
        .bind(session.id)
        .all<{ fan_id: string; type: string; amount: number }>();
  
      const booked = new Map<string, { withdraw: number; deposit: number }>();
      for (const row of existingLedgers.results) {
        const current = booked.get(row.fan_id) ?? { withdraw: 0, deposit: 0 };
        if (row.type === "withdraw") current.withdraw = row.amount;
        if (row.type === "deposit") current.deposit = row.amount;
        booked.set(row.fan_id, current);
      }
  
      const writes = [];
      const touchedFanIds = new Set<string>();
      for (const row of boardRows.results) {
        const current = booked.get(row.fan_id) ?? { withdraw: 0, deposit: 0 };
        const withdrawDelta = row.ticket_used - current.withdraw;
        const depositDelta = row.ticket_deposit - current.deposit;
        const projectedBalance = row.cached_ticket_balance - withdrawDelta + depositDelta;
  
        if (projectedBalance < 0) {
          return context.json(jsonError("存在结算后余额小于 0 的粉丝，请先修正本场取票。"), 400);
        }
  
        if (withdrawDelta > 0) {
          writes.push(
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
                row.fan_id,
                session.id,
                withdrawDelta,
                "场次结算取票入账",
                account.id,
                timestamp
              )
          );
          touchedFanIds.add(row.fan_id);
        } else if (withdrawDelta < 0) {
          writes.push(
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
                row.fan_id,
                session.id,
                Math.abs(withdrawDelta),
                "场次结算取票调减回退",
                account.id,
                timestamp
              )
          );
          touchedFanIds.add(row.fan_id);
        }
  
        if (depositDelta > 0) {
          writes.push(
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
                row.fan_id,
                session.id,
                depositDelta,
                "场次结算存票入账",
                account.id,
                timestamp
              )
          );
          touchedFanIds.add(row.fan_id);
        } else if (depositDelta < 0) {
          writes.push(
            context.env.DB
              .prepare(
                `INSERT INTO ticket_ledgers
                  (id, streamer_id, fan_id, session_id, type, amount, affects_balance, affects_competition,
                   status, note, created_by, created_at)
                 VALUES (?, ?, ?, ?, 'withdraw', ?, 1, 0, 'normal', ?, ?, ?)`
              )
              .bind(
                createId("tkt"),
                streamerId,
                row.fan_id,
                session.id,
                Math.abs(depositDelta),
                "场次结算存票调减扣回",
                account.id,
                timestamp
              )
          );
          touchedFanIds.add(row.fan_id);
        }
      }
  
      if (writes.length > 0) {
        await context.env.DB.batch(writes);
      }
  
      for (const fanId of touchedFanIds) {
        await refreshFanTicketBalance(context.env.DB, fanId);
      }
  
      await context.env.DB.prepare(
        `UPDATE live_sessions
         SET status = 'settled',
             settled_at = ?,
             settlement_confirmed_by = ?,
             updated_at = ?
         WHERE id = ?`
      )
        .bind(timestamp, account.id, timestamp, session.id)
        .run();
  
      await writeAuditLog(
        context.env.DB,
        toPublicAccount(account),
        "settle_live_session",
        "live_session",
        session.id,
        `确认结算场次：${session.title}`,
        streamerId
      );
  
      return context.json({ ok: true, ledgerCount: writes.length });
    }
  
    return context.json(jsonError("场次操作不正确。"), 400);
  });
}
