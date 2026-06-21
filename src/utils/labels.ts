import { rankingStyleOptions, sessionStatusOptions, sessionTypeOptions, ticketTypeOptions } from "../constants";

export function defaultSessionTitle(sessionType: string) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return `${today} ${sessionTypeLabel(sessionType)}`;
}

export function sessionTypeLabel(value: string) {
  return sessionTypeOptions.find((option) => option.key === value)?.label ?? "自定义";
}

export function sessionStatusLabel(value: string) {
  return sessionStatusOptions.find((option) => option.key === value)?.label ?? value;
}

export function ticketTypeLabel(value: string) {
  return ticketTypeOptions.find((option) => option.key === value)?.label ?? value;
}

export function rankingStyleLabel(value: string) {
  return rankingStyleOptions.find((option) => option.key === value)?.label ?? value;
}

export function seatDecisionLabel(value: string) {
  if (value === "recommended") return "推荐上车";
  if (value === "waitlist") return "待定";
  if (value === "away") return "有事不来";
  if (value === "blocked") return "禁赛";
  return value;
}

export function rankingStatusLabel(value: string) {
  if (value === "draft") return "编辑中";
  if (value === "countdown") return "倒计时中";
  if (value === "paused") return "已暂停";
  if (value === "frozen") return "已冻结";
  if (value === "confirmed") return "已确认";
  if (value === "used_for_match") return "已创建对局";
  if (value === "voided") return "已作废";
  return value;
}

export function boardStatusLabel(value: string) {
  if (value === "normal") return "正常竞争";
  if (value === "new_fan") return "本场新粉";
  if (value === "away") return "有事不来";
  if (value === "pending") return "待定";
  if (value === "blocked") return "禁赛";
  return value;
}

export function fanTypeLabel(value: string) {
  if (value === "new_fan") return "新粉";
  if (value === "old_fan") return "老粉";
  return "未标记";
}
