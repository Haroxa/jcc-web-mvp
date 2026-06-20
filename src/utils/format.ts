export function formatDateTime(value: string | null) {
  if (!value) {
    return "未记录";
  }
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  return `${minutes}:${String(remainSeconds).padStart(2, "0")}`;
}

export function toInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}
