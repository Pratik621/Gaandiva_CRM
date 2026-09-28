import dayjs, { type Dayjs } from "dayjs";

export type DailyLeadCount = { date: string; count: number };

export type CampaignAverageAnalysis = {
  startDate: string | null;
  endDate: string | null;
  totalAllocation: number;
  totalUploaded: number;
  remainingLeads: number;
  daysRemaining: number;
  elapsedDays: number;
  totalCampaignDays: number;
  avgUploadPerDay: number;
  requiredUploadPerDay: number | null;
  predictedCompletionDate: string | null;
  progressPercent: number;
  status: "completed" | "overdue" | "on_track" | "behind" | "not_started" | "no_allocation";
  todayUploads: number;
  chartSeries: {
    date: string;
    label: string;
    dailyUpload: number;
    cumulativeActual: number;
    cumulativeExpected: number;
  }[];
  uploadTrend: { date: string; label: string; count: number }[];
};

function eachDayInclusive(start: Dayjs, end: Dayjs): string[] {
  if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) return [];
  const out: string[] = [];
  for (let d = start; !d.isAfter(end, "day"); d = d.add(1, "day")) {
    out.push(d.format("YYYY-MM-DD"));
  }
  return out;
}

export function computeCampaignAverageAnalysis(input: {
  startDate: string | null;
  endDate: string | null;
  totalAllocation: number;
  totalUploaded: number;
  dailyLeads: DailyLeadCount[];
  asOf?: Dayjs;
}): CampaignAverageAnalysis {
  const today = (input.asOf ?? dayjs()).startOf("day");
  const start = input.startDate ? dayjs(input.startDate).startOf("day") : null;
  const end = input.endDate ? dayjs(input.endDate).startOf("day") : null;

  const totalAllocation = Math.max(0, input.totalAllocation);
  const totalUploaded = Math.max(0, input.totalUploaded);
  const remainingLeads = Math.max(0, totalAllocation - totalUploaded);
  const progressPercent =
    totalAllocation > 0 ? Math.min(100, Math.round((totalUploaded / totalAllocation) * 1000) / 10) : 0;

  const countByDate = new Map<string, number>();
  for (const row of input.dailyLeads) {
    countByDate.set(row.date, (countByDate.get(row.date) ?? 0) + row.count);
  }
  const todayKey = today.format("YYYY-MM-DD");
  const todayUploads = countByDate.get(todayKey) ?? 0;

  if (!start?.isValid() || !end?.isValid()) {
    return {
      startDate: input.startDate,
      endDate: input.endDate,
      totalAllocation,
      totalUploaded,
      remainingLeads,
      daysRemaining: 0,
      elapsedDays: 0,
      totalCampaignDays: 0,
      avgUploadPerDay: 0,
      requiredUploadPerDay: null,
      predictedCompletionDate: null,
      progressPercent,
      status: totalAllocation <= 0 ? "no_allocation" : "not_started",
      todayUploads,
      chartSeries: [],
      uploadTrend: input.dailyLeads.map((r) => ({
        date: r.date,
        label: dayjs(r.date).format("MMM D"),
        count: r.count,
      })),
    };
  }

  const totalCampaignDays = Math.max(1, end.diff(start, "day") + 1);

  let elapsedDays = 0;
  if (today.isBefore(start, "day")) {
    elapsedDays = 0;
  } else if (today.isAfter(end, "day")) {
    elapsedDays = totalCampaignDays;
  } else {
    elapsedDays = today.diff(start, "day") + 1;
  }

  let daysRemaining = 0;
  if (today.isAfter(end, "day")) {
    daysRemaining = 0;
  } else if (today.isBefore(start, "day")) {
    daysRemaining = totalCampaignDays;
  } else {
    daysRemaining = end.diff(today, "day") + 1;
  }

  const avgUploadPerDay =
    elapsedDays > 0 ? Math.round((totalUploaded / elapsedDays) * 100) / 100 : 0;

  const requiredUploadPerDay =
    daysRemaining > 0 && remainingLeads > 0
      ? Math.round((remainingLeads / daysRemaining) * 100) / 100
      : remainingLeads === 0
        ? 0
        : null;

  let predictedCompletionDate: string | null = null;
  if (remainingLeads === 0) {
    const uploadDates = [...countByDate.entries()]
      .filter(([, c]) => c > 0)
      .map(([d]) => d)
      .sort();
    predictedCompletionDate = uploadDates[uploadDates.length - 1] ?? todayKey;
  } else if (avgUploadPerDay > 0) {
    const daysNeeded = Math.ceil(remainingLeads / avgUploadPerDay);
    predictedCompletionDate = today.add(Math.max(0, daysNeeded - 1), "day").format("YYYY-MM-DD");
  } else if (daysRemaining > 0 && totalAllocation > 0) {
    const plannedPerDay = totalAllocation / totalCampaignDays;
    if (plannedPerDay > 0) {
      const daysNeeded = Math.ceil(remainingLeads / plannedPerDay);
      predictedCompletionDate = today.add(Math.max(0, daysNeeded - 1), "day").format("YYYY-MM-DD");
    }
  }

  let status: CampaignAverageAnalysis["status"] = "on_track";
  if (totalAllocation <= 0) status = "no_allocation";
  else if (remainingLeads === 0) status = "completed";
  else if (today.isBefore(start, "day")) status = "not_started";
  else if (today.isAfter(end, "day")) status = "overdue";
  else if (predictedCompletionDate && dayjs(predictedCompletionDate).isAfter(end, "day")) {
    status = "behind";
  } else {
    status = "on_track";
  }

  const chartEnd = (() => {
    const candidates = [end, today];
    if (predictedCompletionDate) candidates.push(dayjs(predictedCompletionDate));
    let max = end;
    for (const c of candidates) {
      if (c.isAfter(max, "day")) max = c;
    }
    return max;
  })();

  const dayKeys = eachDayInclusive(start, chartEnd);
  let cumulativeActual = 0;
  const chartSeries = dayKeys.map((dateKey, index) => {
    const dailyUpload = countByDate.get(dateKey) ?? 0;
    cumulativeActual += dailyUpload;
    const dayIndex = dayjs(dateKey).diff(start, "day");
    const cumulativeExpected =
      totalAllocation > 0
        ? Math.round((Math.min(dayIndex + 1, totalCampaignDays) / totalCampaignDays) * totalAllocation * 10) /
          10
        : 0;
    return {
      date: dateKey,
      label: dayjs(dateKey).format("MMM D"),
      dailyUpload,
      cumulativeActual,
      cumulativeExpected,
    };
  });

  // uploadTrend always spans campaign start → end (never forecast days)
  // so the bar chart shows the full campaign period with 0s for empty days.
  const campaignDayKeys = eachDayInclusive(start, end);
  const uploadTrend = campaignDayKeys.map((dateKey) => ({
    date: dateKey,
    label: dayjs(dateKey).format("MMM D"),
    count: countByDate.get(dateKey) ?? 0,
  }));

  return {
    startDate: input.startDate,
    endDate: input.endDate,
    totalAllocation,
    totalUploaded,
    remainingLeads,
    daysRemaining,
    elapsedDays,
    totalCampaignDays,
    avgUploadPerDay,
    requiredUploadPerDay,
    predictedCompletionDate,
    progressPercent,
    status,
    todayUploads,
    chartSeries,
    uploadTrend,
  };
}
