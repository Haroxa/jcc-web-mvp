import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Bindings, FanRow } from "../shared";
import {
  createId,
  getCurrentAccount,
  jsonError,
  normalizeStatuses,
  nowIso,
  resolveStreamerId,
  sessionCookieName,
  toFan,
  toPublicAccount,
  writeAuditLog
} from "../shared";

type WorkerApp = Hono<{ Bindings: Bindings }>;

export function registerFanRoutes(app: WorkerApp) {
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
}
