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
  note?: string
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
      account.streamerId,
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

app.notFound((context) => context.json({ error: "Not found" }, 404));

export default app;
