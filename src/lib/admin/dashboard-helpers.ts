type Trend = "up" | "down" | "neutral";

export function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - t);

  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs || 1} sec ago`;

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function computePercentChange(current: number, previous: number): { changeText: string; trend: Trend } {
  if (previous <= 0) {
    if (current <= 0) return { changeText: "0%", trend: "neutral" };
    return { changeText: "+100%", trend: "up" };
  }
  const pct = ((current - previous) / previous) * 100;
  const trend: Trend = Math.abs(pct) < 0.01 ? "neutral" : pct >= 0 ? "up" : "down";
  const sign = pct >= 0 ? "+" : "";
  return { changeText: `${sign}${pct.toFixed(1)}%`, trend };
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function formatStatusLabel(status: string) {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ROLE_CHART_COLORS = ["#4f46e5", "#52c41a", "#722ed1", "#f59e0b", "#eb2f96", "#13c2c2", "#6b7280", "#4b5563"];

export const LEAD_STATUS_CHART_COLORS: Record<string, string> = {
  new: "#4f46e5",
  open: "#13c2c2",
  interested: "#52c41a",
  followup: "#f59e0b",
  closed_won: "#389e0d",
  closed_lost: "#ff4d4f",
  completed: "#722ed1",
  unknown: "#d1d5db",
};
