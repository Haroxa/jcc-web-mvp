export type Bindings = {
  DB: D1Database;
  SCREENSHOTS?: R2Bucket;
  ADMIN_SETUP_TOKEN?: string;
};


export const sessionCookieName = "jcc_session";
export const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type AccountRow = {
  id: string;
  role: string;
  streamer_id: string | null;
  username: string;
  password_hash: string;
  display_name: string;
  status: string;
  active_session_id: string | null;
};

export type PublicAccount = {
  id: string;
  role: string;
  streamerId: string | null;
  username: string;
  displayName: string;
};

export type StreamerAccountRow = {
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

export type FanRow = {
  id: string;
  streamer_id: string;
  display_name: string;
  douyin_name: string | null;
  wechat_name: string | null;
  game_name: string | null;
  fan_group_level: string | null;
  statuses_json: string;
  is_public_in_balance_board: number;
  public_name: string | null;
  cached_ticket_balance: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type LiveSessionRow = {
  id: string;
  streamer_id: string;
  streamer_name: string | null;
  title: string;
  session_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  settled_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketLedgerRow = {
  id: string;
  streamer_id: string;
  fan_id: string;
  fan_name: string;
  session_id: string | null;
  session_title: string | null;
  type: string;
  amount: number;
  affects_balance: number;
  affects_competition: number;
  status: string;
  note: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  voided_at: string | null;
};

export type RankingSnapshotRow = {
  id: string;
  session_id: string;
  session_title: string;
  streamer_id: string;
  title: string;
  round_no: number;
  style: string;
  status: string;
  countdown_seconds: number;
  countdown_started_at: string | null;
  countdown_ends_at: string | null;
  frozen_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type RankingEntryRow = {
  id: string;
  ranking_snapshot_id: string;
  fan_id: string | null;
  display_name_at_time: string;
  douyin_name_at_time: string | null;
  rank_order: number;
  gift_diamonds: number;
  ticket_used: number;
  manual_adjustment: number;
  competition_score: number;
  fan_type_at_time: string;
  seat_decision: string;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type LiveSessionBoardEntryRow = {
  id: string;
  session_id: string;
  fan_id: string;
  display_name: string;
  douyin_name: string | null;
  statuses_json: string;
  cached_ticket_balance: number;
  settled_withdraw?: number;
  settled_deposit?: number;
  gift_diamonds: number;
  ticket_used: number;
  ticket_deposit: number;
  manual_adjustment: number;
  status: string;
  tie_order: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type StreamerOptionRow = {
  id: string;
  name: string;
};
