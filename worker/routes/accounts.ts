import type { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AccountRow, Bindings, PublicAccount, StreamerAccountRow } from "../shared";
import {
  countAccounts,
  createId,
  createPassword,
  getCurrentAccount,
  hashPassword,
  jsonError,
  nowIso,
  sessionCookieName,
  sessionMaxAgeSeconds,
  sha256,
  toPublicAccount,
  toStreamerAccount,
  verifyPassword,
  writeAuditLog
} from "../shared";

type WorkerApp = Hono<{ Bindings: Bindings }>;

export function registerAccountRoutes(app: WorkerApp) {
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
}
