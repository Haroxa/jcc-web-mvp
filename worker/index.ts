import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie } from "hono/cookie";

import type {
  AccountRow,
  Bindings,
  FanRow,
  LiveSessionBoardEntryRow,
  LiveSessionRow,
  PublicAccount,
  RankingEntryRow,
  RankingSnapshotRow,
  StreamerAccountRow,
  StreamerOptionRow,
  TicketLedgerRow
} from "./shared";
import {
  autoFreezeDueRankings,
  boardCompetitionScore,
  countAccounts,
  createId,
  createPassword,
  fanTypeFromStatuses,
  getCurrentAccount,
  getFanTicketBalance,
  hashPassword,
  jsonError,
  normalizeBoardStatus,
  normalizeRankingStyle,
  normalizeSeatDecision,
  normalizeSessionStatus,
  normalizeSessionType,
  normalizeStatuses,
  normalizeTicketType,
  nowIso,
  parseStatuses,
  refreshFanTicketBalance,
  replaceRankingEntriesFromBoard,
  resolveStreamerId,
  sessionCookieName,
  recomputeRankingDecisions,
  sessionMaxAgeSeconds,
  sha256,
  ticketAffectsBalance,
  ticketAffectsCompetition,
  ticketBalanceDelta,
  toBoardEntry,
  toFan,
  toLiveSession,
  toPublicAccount,
  toRankingEntry,
  toRankingSnapshot,
  toStreamerAccount,
  toTicketLedger,
  verifyPassword,
  writeAuditLog
} from "./shared";

const app = new Hono<{ Bindings: Bindings }>();
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

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
  const projectedBalance = currentBalance - ticketUsed + ticketDeposit;
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
