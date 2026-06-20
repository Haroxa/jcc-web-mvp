import type { FanForm, LiveSessionForm } from "./types";

export const cards = [
  { title: "当前场次", value: "未开始", note: "创建下午场或晚上场后进入直播流程" },
  { title: "待结算", value: "0", note: "直播结束后确认存票入账和回退" },
  { title: "公开存票榜", value: "关闭", note: "游客只看到公开模块和公开字段" },
  { title: "截图存储", value: "暂缓", note: "R2 需绑定银行卡，当前先不启用云端截图" }
];

export const emptyLiveSessionForm: LiveSessionForm = {
  title: "",
  sessionType: "afternoon",
  status: "preparing",
  note: ""
};

export const sessionTypeOptions = [
  { key: "afternoon", label: "下午场" },
  { key: "evening", label: "晚上场" },
  { key: "custom", label: "自定义" }
];

export const sessionStatusOptions = [
  { key: "preparing", label: "准备中" },
  { key: "live", label: "进行中" },
  { key: "pending_settlement", label: "待结算" },
  { key: "settled", label: "已结算" },
  { key: "cancelled", label: "已取消" }
];

export const ticketTypeOptions = [
  { key: "deposit", label: "存票" },
  { key: "withdraw", label: "取票" },
  { key: "gift", label: "现刷" },
  { key: "adjustment", label: "修正" }
];

export const rankingStyleOptions = [
  { key: "top7", label: "定榜七" },
  { key: "top5", label: "定榜五" }
];

export const emptyFanForm: FanForm = {
  displayName: "",
  douyinName: "",
  wechatName: "",
  gameName: "",
  fanGroupLevel: "",
  statuses: [],
  isPublicInBalanceBoard: false,
  publicName: "",
  note: ""
};

export const fanStatusOptions = [
  { key: "new_fan", label: "新粉" },
  { key: "old_fan", label: "老粉" },
  { key: "manager", label: "管理" },
  { key: "violated", label: "违规" },
  { key: "blacklisted", label: "拉黑" }
];
