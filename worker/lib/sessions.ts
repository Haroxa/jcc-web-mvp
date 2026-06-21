import type { LiveSessionRow } from "./types";

export function normalizeSessionType(value?: string) {
  const allowed = new Set(["afternoon", "evening", "custom"]);
  return value && allowed.has(value) ? value : "custom";
}

export function normalizeSessionStatus(value?: string) {
  const allowed = new Set(["preparing", "live", "pending_settlement", "settled", "cancelled"]);
  return value && allowed.has(value) ? value : null;
}

export function toLiveSession(row: LiveSessionRow) {
  return {
    id: row.id,
    streamerId: row.streamer_id,
    streamerName: row.streamer_name,
    title: row.title,
    sessionType: row.session_type,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    settledAt: row.settled_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
