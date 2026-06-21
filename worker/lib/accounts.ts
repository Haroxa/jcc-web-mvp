import type { AccountRow, PublicAccount, StreamerAccountRow, StreamerOptionRow } from "./types";
import { createId, nowIso, sha256 } from "./core";

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
