import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

export type CampaignHealthStatus = "bad" | "fair" | "good" | "very_good";

export type CampaignPerformancePrediction = {
  status: CampaignHealthStatus;
  label: string;
  color: string;
  barPercent: number;
  /** 0–100 position for the health meter indicator */
  meterPosition: number;
  campaignProgressPct: number;
  timeConsumedPct: number;
  remaining: number;
  requiredPerDay: number | null;
  actualPerDay: number;
  paceRatio: number | null;
  predictedCompletion: string | null;
  isPastDue: boolean;
};

function computeMeterPosition(input: {
  status: CampaignHealthStatus;
  paceRatio: number | null;
  campaignProgressPct: number;
  timeConsumedPct: number;
  remaining: number;
}): number {
  if (input.remaining <= 0) return 100;

  if (input.paceRatio != null) {
    const pace = Math.min(1.75, Math.max(0, input.paceRatio));
    return Math.min(97, Math.max(3, Math.round((pace / 1.75) * 100)));
  }

  const delta = input.campaignProgressPct - input.timeConsumedPct;
  const anchor: Record<CampaignHealthStatus, number> = {
    bad: 12,
    fair: 37,
    good: 62,
    very_good: 87,
  };
  return Math.min(97, Math.max(3, Math.round(anchor[input.status] + delta * 0.35)));
}

const STATUS_META: Record<
  CampaignHealthStatus,
  { label: string; color: string }
> = {
  bad: { label: "Bad", color: "#ef4444" },
  fair: { label: "Fair", color: "#f59e0b" },
  good: { label: "Good", color: "#f59e0b" },
  very_good: { label: "Very Good", color: "#52c41a" },
};

function parseCampaignDate(value: string | null): dayjs.Dayjs | null {
  if (!value) return null;
  const strict = dayjs(value, "YYYY-MM-DD", true);
  if (strict.isValid()) return strict.startOf("day");
  const parsed = dayjs(value).startOf("day");
  return parsed.isValid() ? parsed : null;
}

function resolveStatus(
  paceRatio: number | null,
  delta: number,
  isPastDue: boolean,
  remaining: number
): CampaignHealthStatus {
  if (remaining <= 0) return "very_good";
  if (isPastDue) return "bad";

  if (paceRatio != null) {
    if (paceRatio >= 1.15 || delta >= 12) return "very_good";
    if (paceRatio >= 0.95 || delta >= 0) return "good";
    if (paceRatio >= 0.7 || delta >= -12) return "fair";
    return "bad";
  }

  if (delta >= 12) return "very_good";
  if (delta >= 0) return "good";
  if (delta >= -12) return "fair";
  return "bad";
}

export function predictCampaignPerformance(input: {
  totalAllocation: number;
  achieved: number;
  startDate: string | null;
  endDate: string | null;
  referenceDate?: string;
}): CampaignPerformancePrediction {
  const total = Math.max(0, Number(input.totalAllocation) || 0);
  const achieved = Math.max(0, Number(input.achieved) || 0);
  const remaining = Math.max(0, total - achieved);

  const today = input.referenceDate
    ? dayjs(input.referenceDate, "YYYY-MM-DD", true).startOf("day")
    : dayjs().startOf("day");

  const empty: CampaignPerformancePrediction = {
    status: "fair",
    label: STATUS_META.fair.label,
    color: STATUS_META.fair.color,
    barPercent: 0,
    meterPosition: 0,
    campaignProgressPct: 0,
    timeConsumedPct: 0,
    remaining,
    requiredPerDay: null,
    actualPerDay: 0,
    paceRatio: null,
    predictedCompletion: null,
    isPastDue: false,
  };

  if (total <= 0) {
    return { ...empty, label: "N/A", barPercent: 0 };
  }

  const campaignProgressPct = Math.min(100, (achieved / total) * 100);

  if (remaining <= 0) {
    const meta = STATUS_META.very_good;
    return {
      ...empty,
      status: "very_good",
      label: meta.label,
      color: meta.color,
      barPercent: 100,
      meterPosition: 100,
      campaignProgressPct: 100,
      timeConsumedPct: 100,
      remaining: 0,
      requiredPerDay: 0,
      actualPerDay: 0,
      paceRatio: 1,
      predictedCompletion: "Complete",
      isPastDue: false,
    };
  }

  const start = parseCampaignDate(input.startDate);
  const end = parseCampaignDate(input.endDate);

  if (!start || !end) {
    const status: CampaignHealthStatus =
      campaignProgressPct >= 80
        ? "very_good"
        : campaignProgressPct >= 50
          ? "good"
          : campaignProgressPct >= 25
            ? "fair"
            : "bad";
    const meta = STATUS_META[status];
    const meterPosition = computeMeterPosition({
      status,
      paceRatio: null,
      campaignProgressPct,
      timeConsumedPct: 0,
      remaining,
    });
    return {
      ...empty,
      status,
      label: meta.label,
      color: meta.color,
      barPercent: Math.round(campaignProgressPct),
      meterPosition,
      campaignProgressPct,
      timeConsumedPct: 0,
      paceRatio: null,
    };
  }

  const totalDays = Math.max(1, end.diff(start, "day") + 1);
  const isBeforeStart = today.isBefore(start, "day");
  const isPastDue = today.isAfter(end, "day");

  let daysElapsed = today.diff(start, "day") + 1;
  if (isBeforeStart) daysElapsed = 0;
  if (today.isAfter(end, "day")) daysElapsed = totalDays;
  daysElapsed = Math.max(0, Math.min(daysElapsed, totalDays));

  const daysRemaining = isPastDue ? 0 : Math.max(0, end.diff(today, "day"));

  const timeConsumedPct = Math.min(
    100,
    Math.max(0, (daysElapsed / totalDays) * 100)
  );

  const actualPerDay = daysElapsed > 0 ? achieved / daysElapsed : 0;
  const requiredPerDay =
    daysRemaining > 0
      ? remaining / daysRemaining
      : remaining > 0
        ? remaining
        : 0;

  let paceRatio: number | null = null;
  if (requiredPerDay > 0) {
    paceRatio = actualPerDay / requiredPerDay;
  } else if (remaining > 0 && isPastDue) {
    paceRatio = 0;
  }

  const delta = campaignProgressPct - timeConsumedPct;
  const status = resolveStatus(paceRatio, delta, isPastDue, remaining);
  const meta = STATUS_META[status];

  let predictedCompletion: string | null = null;
  if (remaining <= 0) {
    predictedCompletion = "Complete";
  } else if (actualPerDay > 0) {
    const daysNeeded = Math.ceil(remaining / actualPerDay);
    const projected = today.add(daysNeeded, "day");
    predictedCompletion = projected.format("MMM D, YYYY");
    if (end && projected.isAfter(end, "day")) {
      predictedCompletion += ` (after ${end.format("MMM D, YYYY")})`;
    }
  } else if (isBeforeStart) {
    predictedCompletion = "Not started";
  } else {
    predictedCompletion = "Insufficient pace";
  }

  const barPercent =
    paceRatio != null
      ? Math.min(100, Math.max(8, Math.round(paceRatio * 100)))
      : Math.min(100, Math.max(8, Math.round(campaignProgressPct)));

  const meterPosition = computeMeterPosition({
    status,
    paceRatio,
    campaignProgressPct,
    timeConsumedPct,
    remaining,
  });

  return {
    status,
    label: meta.label,
    color: meta.color,
    barPercent,
    meterPosition,
    campaignProgressPct: Math.round(campaignProgressPct * 10) / 10,
    timeConsumedPct: Math.round(timeConsumedPct * 10) / 10,
    remaining,
    requiredPerDay:
      requiredPerDay > 0 ? Math.round(requiredPerDay * 10) / 10 : null,
    actualPerDay: Math.round(actualPerDay * 10) / 10,
    paceRatio: paceRatio != null ? Math.round(paceRatio * 100) / 100 : null,
    predictedCompletion,
    isPastDue,
  };
}
