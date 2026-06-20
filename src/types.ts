export type Account = {
  id: string;
  role: "admin" | "streamer";
  streamerId: string | null;
  username: string;
  displayName: string;
};

export type SetupStatus = {
  needsAdminSetup: boolean;
  requiresSetupToken: boolean;
};

export type WorkspaceTab = "ranking" | "lineup" | "match" | "tickets" | "settlement" | "notes";
export type SessionAction = "start" | "end" | "settle";

export type StreamerAccountItem = {
  streamer: {
    id: string;
    name: string;
    douyinName: string | null;
    note: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  account: {
    id: string;
    username: string;
    displayName: string;
    status: string;
    lastLoginAt: string | null;
  } | null;
};

export type StreamerOption = {
  id: string;
  name: string;
};

export type FanItem = {
  id: string;
  streamerId: string;
  displayName: string;
  douyinName: string | null;
  wechatName: string | null;
  gameName: string | null;
  fanGroupLevel: string | null;
  statuses: string[];
  isPublicInBalanceBoard: boolean;
  publicName: string | null;
  cachedTicketBalance: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveSessionItem = {
  id: string;
  streamerId: string;
  streamerName: string | null;
  title: string;
  sessionType: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  settledAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LiveSessionForm = {
  title: string;
  sessionType: string;
  status: string;
  note: string;
};

export type TicketLedgerItem = {
  id: string;
  streamerId: string;
  fanId: string;
  fanName: string;
  sessionId: string | null;
  sessionTitle: string | null;
  type: string;
  amount: number;
  affectsBalance: boolean;
  affectsCompetition: boolean;
  status: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
  voidedAt: string | null;
};

export type TicketForm = {
  fanId: string;
  sessionId: string;
  type: string;
  amount: string;
  note: string;
};

export type RankingSnapshotItem = {
  id: string;
  sessionId: string;
  sessionTitle: string;
  streamerId: string;
  title: string;
  roundNo: number;
  style: string;
  status: string;
  countdownSeconds: number;
  countdownStartedAt: string | null;
  countdownEndsAt: string | null;
  frozenAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BoardEntryItem = {
  id: string;
  sessionId: string;
  fanId: string;
  displayName: string;
  douyinName: string | null;
  fanStatuses: string[];
  cachedTicketBalance: number;
  giftDiamonds: number;
  ticketUsed: number;
  ticketDeposit: number;
  manualAdjustment: number;
  competitionScore: number;
  balancePreview: number;
  status: string;
  tieOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RankingEntryItem = {
  id: string;
  rankingSnapshotId: string;
  fanId: string | null;
  displayNameAtTime: string;
  rankOrder: number;
  giftDiamonds: number;
  ticketUsed: number;
  manualAdjustment: number;
  competitionScore: number;
  fanTypeAtTime: string;
  seatDecision: string;
  note: string | null;
};

export type RankingForm = {
  sessionId: string;
  roundNo: string;
  title: string;
  style: string;
  note: string;
};

export type RankingEntryForm = {
  fanId: string;
  giftDiamonds: string;
  ticketUsed: string;
  depositAmount: string;
  manualAdjustment: string;
  status: string;
  tieOrder: string;
  note: string;
};

export type FanForm = {
  displayName: string;
  douyinName: string;
  wechatName: string;
  gameName: string;
  fanGroupLevel: string;
  statuses: string[];
  isPublicInBalanceBoard: boolean;
  publicName: string;
  note: string;
};
