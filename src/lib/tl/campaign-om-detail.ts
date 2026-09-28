import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  buildQaNameToIdMap,
  isAppStampedQaAudit,
  leadHasQaOutcome,
  qaAuditActivityDay,
  resolveQaUserId,
} from "@/lib/qa-audit-attribution";
import { getPrimaryTlIdForAgent, buildTeamHierarchy } from "@/lib/tl/team-hierarchy";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";

dayjs.extend(utc);
dayjs.extend(timezone);

const LEADS_PAGE_SIZE = 1000;

export type OmCampaignDetailAgent = {
  agent_id: string;
  agent_name: string;
  tl_id: string | null;
  tl_name: string | null;
  total_leads: number;
  qualified_leads: number;
};

export type OmCampaignDetailQa = {
  qa_id: string;
  qa_name: string;
  total_audited: number;
  qualified_leads: number;
  disqualified_leads: number;
};

export type OmCampaignDetailResponse = {
  campaign: {
    campaign_id: string;
    campaign_name: string;
    campaign_code: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    total_allocation: number;
    qualified_leads: number;
    disqualified_leads: number;
    delivered_leads: number;
  };
  summary: {
    total_leads: number;
  };
  agents: OmCampaignDetailAgent[];
  qa_summaries: OmCampaignDetailQa[];
  date_range: { start: string; end: string };
};

type LeadRow = {
  campaign_id: string;
  assigned_agent_id: string | null;
  created_by: string | null;
  qa_status: string | null;
  delivery_status: string | null;
};

type QaAuditLeadRow = {
  id: string;
  qa_status: string | null;
  qa_name: string | null;
  qa_audited_by_id: string | null;
  qa_audited_at: string | null;
  audit_date: string | null;
  updated_at: string;
};

function resolveLeadAgentId(lead: {
  assigned_agent_id: string | null;
  created_by: string | null;
}): string | null {
  return lead.assigned_agent_id ?? lead.created_by ?? null;
}

function isQualifiedQa(qa: string | null | undefined): boolean {
  const q = String(qa ?? "").trim().toLowerCase();
  return q === "qualified" || q === "approved" || q === "pass";
}

function isDisqualifiedQa(qa: string | null | undefined): boolean {
  return String(qa ?? "").trim().toLowerCase() === "disqualified";
}

function isDeliveredLead(deliveryStatus: string | null | undefined): boolean {
  const ds = String(deliveryStatus ?? "").trim().toLowerCase();
  return ds === "delivered" || ds === "delivered_by_mis";
}

async function fetchCampaignLeadRows(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  params: { orgId: string; campaignId: string; startUtc: string; endUtc: string }
): Promise<LeadRow[]> {
  const all: LeadRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("leads")
      .select("campaign_id, assigned_agent_id, created_by, qa_status, delivery_status")
      .eq("organization_id", params.orgId)
      .eq("campaign_id", params.campaignId)
      .gte("created_at", params.startUtc)
      .lte("created_at", params.endUtc)
      .order("created_at", { ascending: true })
      .range(offset, offset + LEADS_PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = (data ?? []) as LeadRow[];
    all.push(...chunk);
    if (chunk.length < LEADS_PAGE_SIZE) break;
    offset += LEADS_PAGE_SIZE;
  }

  return all;
}

async function fetchQaAuditLeadRows(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string,
  campaignId: string
): Promise<QaAuditLeadRow[]> {
  const all: QaAuditLeadRow[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("leads")
      .select("id, qa_status, qa_name, qa_audited_by_id, qa_audited_at, audit_date, updated_at")
      .eq("organization_id", orgId)
      .eq("campaign_id", campaignId)
      .not("qa_status", "is", null)
      .order("updated_at", { ascending: true })
      .range(offset, offset + LEADS_PAGE_SIZE - 1);

    if (error) throw error;
    const chunk = (data ?? []) as QaAuditLeadRow[];
    all.push(...chunk.filter((l) => leadHasQaOutcome(l.qa_status)));
    if (chunk.length < LEADS_PAGE_SIZE) break;
    offset += LEADS_PAGE_SIZE;
  }

  return all;
}

export async function fetchOmCampaignDetail(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  params: {
    orgId: string;
    campaignId: string;
    startUtc: string;
    endUtc: string;
    startDate: string;
    endDate: string;
    appTz: string;
  }
): Promise<OmCampaignDetailResponse | null> {
  const { data: campaign, error: campaignError } = await admin
    .from("campaigns")
    .select("id, name, campaign_code, status, start_date, end_date, total_allocation")
    .eq("organization_id", params.orgId)
    .eq("id", params.campaignId)
    .single();

  if (campaignError || !campaign) return null;

  type CampaignRow = {
    id: string;
    name: string;
    campaign_code: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    total_allocation: number | null;
    assigned_team_leader_id: string | null;
  };

  const camp = campaign as CampaignRow;

  const [{ data: orgUsers }, { data: allCampaigns }, { data: assignments }] = await Promise.all([
    admin
      .from("users")
      .select(
        "id, full_name, email, agent_code, status, reporting_manager_id, user_roles(roles(name))"
      )
      .eq("organization_id", params.orgId)
      .eq("status", "active"),
    admin
      .from("campaigns")
      .select("id, assigned_team_leader_id")
      .eq("organization_id", params.orgId),
    admin
      .from("campaign_assignments")
      .select("campaign_id, agent_id")
      .eq("campaign_id", params.campaignId)
      .eq("is_active", true),
  ]);

  type OrgUser = {
    id: string;
    full_name: string | null;
    email: string | null;
    agent_code: string | null;
    status: string;
    reporting_manager_id: string | null;
    user_roles: { roles: { name: string } | null }[] | null;
  };

  const users = (orgUsers ?? []) as OrgUser[];
  const userLabel = (u: OrgUser) => u.full_name?.trim() || u.email?.trim() || "Unknown";
  const allTLs = users.filter((u) =>
    (u.user_roles ?? []).some((r) => isCampaignTeamLeaderRole(r.roles?.name))
  );
  const tlById = new Map(allTLs.map((tl) => [tl.id, tl]));
  const actualTlIdSet = new Set(allTLs.map((tl) => tl.id));

  const teamHierarchy = buildTeamHierarchy(
    users as Parameters<typeof buildTeamHierarchy>[0],
    (allCampaigns ?? []) as { id: string; assigned_team_leader_id: string | null }[],
    (assignments ?? []) as { campaign_id: string; agent_id: string }[]
  );

  const leads = await fetchCampaignLeadRows(admin, {
    orgId: params.orgId,
    campaignId: params.campaignId,
    startUtc: params.startUtc,
    endUtc: params.endUtc,
  });

  let qualifiedLeads = 0;
  let disqualifiedLeads = 0;
  let deliveredLeads = 0;

  const agentAgg = new Map<string, { total: number; qualified: number }>();
  for (const lead of leads) {
    const agId = resolveLeadAgentId(lead);
    if (!agId) continue;
    if (!agentAgg.has(agId)) agentAgg.set(agId, { total: 0, qualified: 0 });
    const agg = agentAgg.get(agId)!;
    agg.total += 1;
    if (isQualifiedQa(lead.qa_status)) {
      agg.qualified += 1;
      qualifiedLeads += 1;
    }
    if (isDisqualifiedQa(lead.qa_status)) disqualifiedLeads += 1;
    if (isDeliveredLead(lead.delivery_status)) deliveredLeads += 1;
  }

  const agents: OmCampaignDetailAgent[] = [...agentAgg.entries()]
    .map(([agentId, agg]) => {
      const u = users.find((x) => x.id === agentId);
      const effTlId = u
        ? getPrimaryTlIdForAgent(
            agentId,
            u.reporting_manager_id,
            teamHierarchy,
            actualTlIdSet
          )
        : null;
      const tlRow = effTlId ? tlById.get(effTlId) : undefined;
      return {
        agent_id: agentId,
        agent_name: u ? userLabel(u) : "Unknown agent",
        tl_id: effTlId,
        tl_name: tlRow ? userLabel(tlRow) : null,
        total_leads: agg.total,
        qualified_leads: agg.qualified,
      };
    })
    .filter((a) => a.total_leads > 0)
    .sort((a, b) => b.total_leads - a.total_leads);

  const allQAs = users.filter((u) =>
    (u.user_roles ?? []).some((r) => {
      const n = (r.roles?.name ?? "").trim().toLowerCase().replace(/\s+/g, "_");
      return n === "qa";
    })
  );
  const qaIds = new Set(allQAs.map((qa) => qa.id));
  const qaNameToId = buildQaNameToIdMap(
    allQAs.map((qa) => ({ id: qa.id, full_name: qa.full_name, email: qa.email })),
    (qa) => {
      const row = allQAs.find((u) => u.id === qa.id)!;
      return userLabel(row);
    }
  );

  const auditLeads = await fetchQaAuditLeadRows(admin, params.orgId, params.campaignId);
  const qaAggMap = new Map<
    string,
    { total: number; qualified: number; disqualified: number }
  >();
  for (const qa of allQAs) qaAggMap.set(qa.id, { total: 0, qualified: 0, disqualified: 0 });

  const formatAuditDay = (iso: string, tz: string) =>
    dayjs(iso).tz(tz).format("YYYY-MM-DD");

  const countedLeadKeys = new Set<string>();
  for (const lead of auditLeads) {
    const isApp = isAppStampedQaAudit(lead.qa_audited_by_id, qaIds);
    const qaUserId = resolveQaUserId(lead.qa_audited_by_id, lead.qa_name, qaIds, qaNameToId);
    if (!qaUserId) continue;

    const activityDay = qaAuditActivityDay(lead, isApp, params.appTz, formatAuditDay);
    if (activityDay < params.startDate || activityDay > params.endDate) continue;

    const dedupeKey = `${qaUserId}:${lead.id}`;
    if (countedLeadKeys.has(dedupeKey)) continue;
    countedLeadKeys.add(dedupeKey);

    const agg = qaAggMap.get(qaUserId)!;
    agg.total += 1;
    if (isQualifiedQa(lead.qa_status)) agg.qualified += 1;
    if (isDisqualifiedQa(lead.qa_status)) agg.disqualified += 1;
  }

  const qa_summaries: OmCampaignDetailQa[] = allQAs
    .map((qa) => {
      const agg = qaAggMap.get(qa.id) ?? { total: 0, qualified: 0, disqualified: 0 };
      return {
        qa_id: qa.id,
        qa_name: userLabel(qa),
        total_audited: agg.total,
        qualified_leads: agg.qualified,
        disqualified_leads: agg.disqualified,
      };
    })
    .filter((q) => q.total_audited > 0)
    .sort((a, b) => b.total_audited - a.total_audited);

  return {
    campaign: {
      campaign_id: camp.id,
      campaign_name: camp.name,
      campaign_code: camp.campaign_code,
      status: camp.status,
      start_date: camp.start_date,
      end_date: camp.end_date,
      total_allocation: Math.max(0, Number(camp.total_allocation ?? 0) || 0),
      qualified_leads: qualifiedLeads,
      disqualified_leads: disqualifiedLeads,
      delivered_leads: deliveredLeads,
    },
    summary: { total_leads: leads.length },
    agents,
    qa_summaries,
    date_range: { start: params.startDate, end: params.endDate },
  };
}
