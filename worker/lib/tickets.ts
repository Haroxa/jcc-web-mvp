import type { TicketLedgerRow } from "./types";
import { nowIso } from "./core";

export function normalizeTicketType(value?: string) {
  const allowed = new Set(["deposit", "withdraw", "gift", "adjustment"]);
  return value && allowed.has(value) ? value : null;
}

export function ticketBalanceDelta(type: string, amount: number) {
  if (type === "deposit" || type === "adjustment") return amount;
  if (type === "withdraw") return -amount;
  return 0;
}

export function ticketAffectsBalance(type: string) {
  return type === "deposit" || type === "withdraw" || type === "adjustment";
}

export function ticketAffectsCompetition(type: string) {
  return type === "withdraw" || type === "gift";
}

export async function getFanTicketBalance(db: D1Database, fanId: string) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE
           WHEN type = 'deposit' THEN amount
           WHEN type = 'withdraw' THEN -amount
           WHEN type = 'adjustment' THEN amount
           ELSE 0
         END
       ), 0) AS balance
       FROM ticket_ledgers
       WHERE fan_id = ? AND status = 'normal' AND affects_balance = 1`
    )
    .bind(fanId)
    .first<{ balance: number }>();

  return row?.balance ?? 0;
}

export function toTicketLedger(row: TicketLedgerRow) {
  return {
    id: row.id,
    streamerId: row.streamer_id,
    fanId: row.fan_id,
    fanName: row.fan_name,
    sessionId: row.session_id,
    sessionTitle: row.session_title,
    type: row.type,
    amount: row.amount,
    affectsBalance: Boolean(row.affects_balance),
    affectsCompetition: Boolean(row.affects_competition),
    status: row.status,
    note: row.note,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    voidedAt: row.voided_at
  };
}

export async function refreshFanTicketBalance(db: D1Database, fanId: string) {
  const balance = await getFanTicketBalance(db, fanId);

  await db
    .prepare("UPDATE fans SET cached_ticket_balance = ?, updated_at = ? WHERE id = ?")
    .bind(balance, nowIso(), fanId)
    .run();
}
