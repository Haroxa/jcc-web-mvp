import type { FanRow } from "./types";

export function parseStatuses(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeStatuses(statuses?: string[]) {
  const allowed = new Set(["new_fan", "old_fan", "manager", "violated", "blacklisted"]);
  return [...new Set((statuses ?? []).filter((status) => allowed.has(status)))];
}

export function toFan(row: FanRow) {
  return {
    id: row.id,
    streamerId: row.streamer_id,
    displayName: row.display_name,
    douyinName: row.douyin_name,
    wechatName: row.wechat_name,
    gameName: row.game_name,
    fanGroupLevel: row.fan_group_level,
    statuses: parseStatuses(row.statuses_json),
    isPublicInBalanceBoard: Boolean(row.is_public_in_balance_board),
    publicName: row.public_name,
    cachedTicketBalance: row.cached_ticket_balance,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
