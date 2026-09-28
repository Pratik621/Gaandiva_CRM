import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { parseNumeric, pickFormValue } from "@/lib/command/campaign-performance-report";

dayjs.extend(customParseFormat);

export type OverviewCampaignRow = {
  id: string;
  name: string;
  campaign_id: string;
  client_id?: string | null;
  total_allocation?: number | null;
  achieved?: number | null;
};

export type OverviewMetricsRow = {
  campaign_id: string;
  total_leads: number | null;
  total_leads_allocated: number | null;
  total_campaign_spend: number | null;
  total_leads_delivered: number | null;
  deficit_leads: number | null;
  lead_increment: number | null;
  lead_replace: number | null;
  daily_reporting: Record<string, unknown> | null;
  qa_pending_count: number | null;
  qualified_count: number | null;
  registered_count: number | null;
  attended_count: number | null;
  channel_split: Record<string, unknown> | null;
};

export type OverviewLeadRow = {
  created_at: string;
  delivered_at: string | null;
  delivery_status: string | null;
  channel: string | null;
  qa_status: string | null;
  registered_at: string | null;
  appointment: string | null;
  campaign_id: string;
  campaigns?: { name?: string | null } | { name?: string | null }[] | null;
};

export type OverviewHistoryRow = {
  campaign_id: string;
  date: string;
  total_leads_delivered: number | null;
  total_campaign_spend: number | null;
  deficit_leads: number | null;
  channel_split: Record<string, unknown> | null;
  created_at: string;
};

export type OverviewReportRow = {
  crm_campaign_uuid: string | null;
  start_date: string | null;
  end_date: string | null;
  outbound_data: {
    pacingEntries?: Array<{ date?: string; value?: string | number | null }>;
    formData?: Record<string, unknown>;
  } | null;
  landing_page_data: {
    formData?: Record<string, unknown>;
  } | null;
  poc_clicks_data: {
    formData?: Record<string, unknown>;
  } | null;
};

export type OverviewChannelDaily = {
  date: string;
  campaignName: string;
  email: number;
  telemarketing: number;
};

export type OverviewTrendDaily = {
  date: string;
  leads_delivered: number;
  spend: number;
  deficit: number;
};

export type OverviewPayload = {
  kpis: {
    totalCampaigns: number;
    totalLeads: number;
    qualified: number;
    registrations: number;
    attendees: number;
  };
  metrics: {
    total_leads_allocated: number;
    total_campaign_spend: number;
    total_leads_delivered: number;
    deficit_leads: number;
    lead_increment: number;
    lead_replace: number;
  };
  funnel: {
    leads: number;
    qa: number;
    qualified: number;
    registered: number;
    attended: number;
  };
  bar: { registrations: number; attendees: number };
  channelSplit: Array<{ name: string; value: number }>;
  channelSplitDaily: OverviewChannelDaily[];
  trendDaily: OverviewTrendDaily[];
  performance: {
    deliveryRate: number;
    deficitRate: number;
    registrationRate: number;
    attendanceRate: number;
  };
};

function toPct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

function metricsHasData(rows: OverviewMetricsRow[]): boolean {
  if (rows.length === 0) return false;
  return rows.some(
    (r) =>
      Number(r.total_leads ?? 0) > 0 ||
      Number(r.total_leads_delivered ?? 0) > 0 ||
      Number(r.qualified_count ?? 0) > 0
  );
}

function parseReportDateLabel(dateLabel: string, startDate: string | null): string {
  const trimmed = dateLabel.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const year = startDate ? dayjs(startDate).year() : dayjs().year();
  const parsed = dayjs(`${trimmed} ${year}`, "MMM DD YYYY", true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  const parsedAlt = dayjs(`${trimmed} ${year}`, "MMM D YYYY", true);
  if (parsedAlt.isValid()) return parsedAlt.format("YYYY-MM-DD");
  return trimmed;
}

function campaignNameFromLead(l: OverviewLeadRow): string {
  return Array.isArray(l.campaigns)
    ? (l.campaigns[0]?.name ?? "Unknown Campaign")
    : (l.campaigns?.name ?? "Unknown Campaign");
}

function aggregateLeadStats(
  leadRows: OverviewLeadRow[],
  isClientViewer: boolean
): {
  totalLeads: number;
  qualified: number;
  qa: number;
  registrations: number;
  attendees: number;
  delivered: number;
} {
  let totalLeads = 0;
  let qualified = 0;
  let qa = 0;
  let registrations = 0;
  let attendees = 0;
  let delivered = 0;

  for (const l of leadRows) {
    const status = (l.delivery_status ?? "").toLowerCase();
    const qaStatus = (l.qa_status ?? "").toLowerCase();
    const isDelivered = status === "delivered";

    if (isClientViewer && !isDelivered) continue;

    totalLeads += 1;
    if (isDelivered) delivered += 1;
    if (qaStatus === "qualified" && isDelivered) qualified += 1;
    if (isDelivered && qaStatus && qaStatus !== "qualified") qa += 1;
    if (l.registered_at) registrations += 1;
    if (l.appointment) attendees += 1;
  }

  return { totalLeads, qualified, qa, registrations, attendees, delivered };
}

function aggregateFromReports(
  reports: OverviewReportRow[],
  campaignNameById: Map<string, string>
): {
  registrations: number;
  attendees: number;
  channelSplitDaily: OverviewChannelDaily[];
  trendDaily: OverviewTrendDaily[];
  outboundDelivered: number;
  lpUsers: number;
} {
  let registrations = 0;
  let attendees = 0;
  let outboundDelivered = 0;
  let lpUsers = 0;
  const channelDailyMap: Record<string, OverviewChannelDaily> = {};
  const trendMap: Record<string, OverviewTrendDaily> = {};

  for (const report of reports) {
    const campaignId = report.crm_campaign_uuid;
    if (!campaignId) continue;
    const campaignName = campaignNameById.get(campaignId) ?? "Unknown Campaign";

    const landing = report.landing_page_data?.formData ?? {};
    const clicks = report.poc_clicks_data?.formData ?? {};
    const outbound = report.outbound_data?.formData ?? {};

    const formDownloads = parseNumeric(pickFormValue(landing, ["formDownloads"])) ?? 0;
    const clicksTotal =
      parseNumeric(pickFormValue(clicks, ["totalECsClicked", "totalClicked"])) ?? 0;
    const outboundDel =
      parseNumeric(
        pickFormValue(outbound, ["totalEmailsDelivered", "totalLeadsDelivered"])
      ) ?? 0;
    const users = parseNumeric(pickFormValue(landing, ["totalUsers"])) ?? 0;

    registrations += formDownloads;
    attendees += clicksTotal;
    outboundDelivered += outboundDel;
    lpUsers += users;

    const pacing = report.outbound_data?.pacingEntries ?? [];
    for (const entry of pacing) {
      const rawDate = entry.date?.trim();
      const value = parseNumeric(entry.value) ?? 0;
      if (!rawDate || value <= 0) continue;
      const isoDate = parseReportDateLabel(rawDate, report.start_date);
      const channelKey = `${isoDate}__${campaignId}`;
      if (!channelDailyMap[channelKey]) {
        channelDailyMap[channelKey] = {
          date: isoDate,
          campaignName,
          email: 0,
          telemarketing: 0,
        };
      }
      channelDailyMap[channelKey].email += value;

      if (!trendMap[isoDate]) {
        trendMap[isoDate] = { date: isoDate, leads_delivered: 0, spend: 0, deficit: 0 };
      }
      trendMap[isoDate].leads_delivered += value;
    }
  }

  const channelSplitDaily = Object.values(channelDailyMap).sort(
    (a, b) => a.date.localeCompare(b.date) || a.campaignName.localeCompare(b.campaignName)
  );
  const trendDaily = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  return {
    registrations,
    attendees,
    channelSplitDaily,
    trendDaily,
    outboundDelivered,
    lpUsers,
  };
}

function aggregateFromCampaignRows(campaignRows: OverviewCampaignRow[]): {
  totalAllocated: number;
  delivered: number;
  deficit: number;
} {
  let totalAllocated = 0;
  let delivered = 0;
  for (const c of campaignRows) {
    totalAllocated += Number(c.total_allocation ?? 0);
    delivered += Number(c.achieved ?? 0);
  }
  const deficit = Math.max(0, totalAllocated - delivered);
  return { totalAllocated, delivered, deficit };
}

export function buildOverviewPayload(input: {
  campaignRows: OverviewCampaignRow[];
  metricsRows: OverviewMetricsRow[];
  leadRows: OverviewLeadRow[];
  historyRows: OverviewHistoryRow[];
  reportRows: OverviewReportRow[];
  isClientViewer: boolean;
}): OverviewPayload {
  const { campaignRows, metricsRows, leadRows, historyRows, reportRows, isClientViewer } =
    input;
  const campaignNameById = new Map(campaignRows.map((c) => [c.id, c.name]));

  const useMetrics = metricsHasData(metricsRows);
  const leadStats = aggregateLeadStats(leadRows, isClientViewer);
  const reportStats = aggregateFromReports(reportRows, campaignNameById);
  const campaignTotals = aggregateFromCampaignRows(campaignRows);

  const sumMetrics = <K extends keyof OverviewMetricsRow>(key: K) =>
    metricsRows.reduce((acc, r) => acc + Number(r[key] ?? 0), 0);

  let totalLeads = useMetrics ? sumMetrics("total_leads") : leadStats.totalLeads;
  let totalAllocated = useMetrics
    ? sumMetrics("total_leads_allocated")
    : campaignTotals.totalAllocated;
  const totalSpend = sumMetrics("total_campaign_spend");
  let delivered = useMetrics
    ? sumMetrics("total_leads_delivered")
    : Math.max(leadStats.delivered, campaignTotals.delivered);
  let deficit = useMetrics ? sumMetrics("deficit_leads") : campaignTotals.deficit;
  const increment = sumMetrics("lead_increment");
  const replace = sumMetrics("lead_replace");
  let qa = useMetrics ? sumMetrics("qa_pending_count") : leadStats.qa;
  let qualified = useMetrics ? sumMetrics("qualified_count") : leadStats.qualified;
  let registrations = useMetrics
    ? sumMetrics("registered_count")
    : leadStats.registrations;
  let attendees = useMetrics ? sumMetrics("attended_count") : leadStats.attendees;

  if (!useMetrics) {
    if (registrations === 0 && reportStats.registrations > 0) {
      registrations = reportStats.registrations;
    }
    if (attendees === 0) {
      attendees = qualified > 0 ? qualified : reportStats.attendees;
    }
    if (delivered === 0 && reportStats.outboundDelivered > 0) {
      delivered = reportStats.outboundDelivered;
    }
    if (totalLeads === 0 && delivered > 0) totalLeads = delivered;
    if (totalAllocated === 0) {
      totalAllocated = campaignTotals.totalAllocated;
    }
    if (deficit === 0 && totalAllocated > 0) {
      deficit = Math.max(0, totalAllocated - Math.min(delivered, totalAllocated));
    }
  }

  // KPI cards may use LP/report totals; funnel stays lead-pipeline shaped.
  const funnelRegistered =
    leadStats.registrations > 0
      ? leadStats.registrations
      : qualified > 0
        ? qualified
        : registrations;
  const funnelAttended =
    leadStats.attendees > 0
      ? leadStats.attendees
      : funnelRegistered > 0
        ? Math.min(attendees, funnelRegistered)
        : attendees;

  const channelAgg: Record<string, number> = {};
  for (const row of metricsRows) {
    const split = row.channel_split ?? {};
    if (split && typeof split === "object") {
      for (const [k, v] of Object.entries(split)) {
        channelAgg[k] = (channelAgg[k] ?? 0) + Number(v ?? 0);
      }
    }
  }
  if (Object.keys(channelAgg).length === 0 && reportStats.channelSplitDaily.length > 0) {
    let emailTotal = 0;
    let teleTotal = 0;
    for (const row of reportStats.channelSplitDaily) {
      emailTotal += row.email;
      teleTotal += row.telemarketing;
    }
    if (emailTotal > 0) channelAgg.email = emailTotal;
    if (teleTotal > 0) channelAgg.telemarketing = teleTotal;
  }

  const channelDailyMap: Record<string, OverviewChannelDaily> = {};
  for (const l of leadRows) {
    const rawDate =
      isClientViewer && l.delivered_at ? l.delivered_at : l.created_at;
    const date = (rawDate ?? "").slice(0, 10);
    if (!date) continue;
    const campName = campaignNameFromLead(l);
    const key = `${date}__${l.campaign_id}`;
    if (!channelDailyMap[key]) {
      channelDailyMap[key] = { date, campaignName: campName, email: 0, telemarketing: 0 };
    }
    const channel = (l.channel ?? "email").toLowerCase();
    if (channel.includes("tele")) channelDailyMap[key].telemarketing += 1;
    else channelDailyMap[key].email += 1;
  }

  if (Object.keys(channelDailyMap).length === 0) {
    for (const row of metricsRows) {
      const split = (row.channel_split ?? {}) as Record<string, unknown>;
      const daily = (row.daily_reporting ?? {}) as Record<string, unknown>;
      const campaignName = campaignNameById.get(row.campaign_id) ?? "Unknown Campaign";
      const emailRatioRaw = Number(split.email ?? split.Email ?? split["e-mail"] ?? 0);
      const teleRatioRaw = Number(
        split.telemarketing ?? split.tele ?? split.phone ?? split.calling ?? 0
      );
      const ratioDen = emailRatioRaw + teleRatioRaw;
      const emailRatio = ratioDen > 0 ? emailRatioRaw / ratioDen : 1;

      for (const [date, payload] of Object.entries(daily)) {
        const p = payload as { delivered?: number; allocated?: number };
        const dayDelivered = Number(p?.delivered ?? p?.allocated ?? 0);
        if (dayDelivered <= 0) continue;
        const key = `${date}__${row.campaign_id}`;
        channelDailyMap[key] = {
          date,
          campaignName,
          email: Math.round(dayDelivered * emailRatio),
          telemarketing: Math.max(0, dayDelivered - Math.round(dayDelivered * emailRatio)),
        };
      }
    }
  }

  let channelSplitDaily = Object.values(channelDailyMap).sort(
    (a, b) => a.date.localeCompare(b.date) || a.campaignName.localeCompare(b.campaignName)
  );
  if (channelSplitDaily.length === 0 && reportStats.channelSplitDaily.length > 0) {
    channelSplitDaily = reportStats.channelSplitDaily;
  }

  const latestPerCampaignDate = new Map<string, OverviewHistoryRow>();
  for (const h of historyRows) {
    const key = `${h.campaign_id}__${h.date}`;
    if (!latestPerCampaignDate.has(key)) latestPerCampaignDate.set(key, h);
  }
  const trendMap: Record<string, OverviewTrendDaily> = {};
  for (const h of latestPerCampaignDate.values()) {
    if (!trendMap[h.date]) {
      trendMap[h.date] = { date: h.date, leads_delivered: 0, spend: 0, deficit: 0 };
    }
    trendMap[h.date].leads_delivered += Number(h.total_leads_delivered ?? 0);
    trendMap[h.date].spend += Number(h.total_campaign_spend ?? 0);
    trendMap[h.date].deficit += Number(h.deficit_leads ?? 0);
  }
  let trendDaily = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));
  if (trendDaily.length === 0 && reportStats.trendDaily.length > 0) {
    trendDaily = reportStats.trendDaily.map((row) => ({
      ...row,
      spend: 0,
      deficit: 0,
    }));
  }

  const registrationDen =
    reportStats.lpUsers > 0 ? reportStats.lpUsers : totalLeads || delivered;
  const attendanceDen = registrations > 0 ? registrations : qualified;

  return {
    kpis: {
      totalCampaigns: campaignRows.length,
      totalLeads,
      qualified,
      registrations,
      attendees,
    },
    metrics: {
      total_leads_allocated: totalAllocated,
      total_campaign_spend: totalSpend,
      total_leads_delivered: delivered,
      deficit_leads: deficit,
      lead_increment: increment,
      lead_replace: replace,
    },
    funnel: {
      leads: totalLeads,
      qa,
      qualified,
      registered: funnelRegistered,
      attended: funnelAttended,
    },
    bar: { registrations, attendees: funnelAttended },
    channelSplit: Object.entries(channelAgg).map(([name, value]) => ({ name, value })),
    channelSplitDaily,
    trendDaily,
    performance: {
      deliveryRate: toPct(delivered, totalAllocated || totalLeads),
      deficitRate: toPct(deficit, totalAllocated || totalLeads),
      registrationRate: toPct(registrations, registrationDen),
      attendanceRate: toPct(attendees, attendanceDen),
    },
  };
}
