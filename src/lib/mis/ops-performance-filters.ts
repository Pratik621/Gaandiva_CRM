import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  buildTeamHierarchy,
  getTeamLeaderLabel,
  getTeamMemberLabel,
} from "@/lib/tl/team-hierarchy";
import { POSTGREST_PAGE_SIZE } from "@/lib/supabase/in-chunks";

dayjs.extend(utc);
dayjs.extend(timezone);

export type OpsReportFilterParams = {
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  startUtc: string;
  endUtc: string;
  campaignIds: string[] | null;
  leadTypes: string[] | null;
  regions: string[] | null;
  channels: string[] | null;
  qaStatuses: string[] | null;
  tlIds: string[] | null;
  agentIds: string[] | null;
};

export type OpsReportFilterOptions = {
  team_leaders: Array<{
    id: string;
    name: string;
    agents: Array<{ id: string; name: string }>;
  }>;
  agents: Array<{ id: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  lead_types: string[];
  regions: string[];
  channels: string[];
  qa_statuses: Array<{ value: string; label: string }>;
};

function splitCsv(value: string | null): string[] | null {
  if (!value?.trim()) return null;
  const parts = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function normalizeTime(raw: string | null | undefined, fallback: string): string {
  const v = (raw ?? "").trim();
  if (!v) return fallback;
  if (/^\d{2}:\d{2}$/.test(v)) return v;
  if (/^\d{2}:\d{2}:\d{2}$/.test(v)) return v.slice(0, 5);
  return fallback;
}

export function utcFromLocalDateTime(
  dateStr: string,
  timeStr: string,
  tz: string,
  endOfMinute: boolean
): string {
  const hhmm = normalizeTime(timeStr, endOfMinute ? "23:59" : "00:00");
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  const local = dayjs.tz(
    `${dateStr} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
    "YYYY-MM-DD HH:mm:ss",
    tz
  );
  if (endOfMinute) {
    return local.endOf("minute").utc().toISOString();
  }
  return local.utc().toISOString();
}

export function parseOpsReportFilterParams(
  sp: URLSearchParams,
  appTz: string,
  defaults: { startDate: string; endDate: string }
): Omit<OpsReportFilterParams, "startUtc" | "endUtc"> & {
  startUtc: string;
  endUtc: string;
} {
  const startDate = sp.get("start_date")?.trim() || defaults.startDate;
  const endDate = sp.get("end_date")?.trim() || defaults.endDate;
  const startTime = normalizeTime(sp.get("start_time"), "00:00");
  const endTime = normalizeTime(sp.get("end_time"), "23:59");

  return {
    startDate,
    endDate,
    startTime,
    endTime,
    startUtc: utcFromLocalDateTime(startDate, startTime, appTz, false),
    endUtc: utcFromLocalDateTime(endDate, endTime, appTz, true),
    campaignIds: splitCsv(sp.get("campaign_ids")),
    leadTypes: splitCsv(sp.get("lead_types")),
    regions: splitCsv(sp.get("regions")),
    channels: splitCsv(sp.get("channels")),
    qaStatuses: splitCsv(sp.get("qa_statuses")),
    tlIds: splitCsv(sp.get("tl_ids")),
    agentIds: splitCsv(sp.get("agent_ids")),
  };
}

type CampaignRow = {
  id: string;
  name: string;
  client_id: string | null;
  lead_type: string | null;
  geography: string | null;
};

function campaignMatchesLeadTypes(leadType: string | null, selected: string[]): boolean {
  if (!leadType?.trim()) return false;
  const parts = leadType.split(/[,;]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const wanted = new Set(selected.map((s) => s.trim().toLowerCase()).filter(Boolean));
  return parts.some((p) => wanted.has(p));
}

/** Org-scoped + paginated — never `.in(campaign_id, hundreds)` (HTTP header overflow). */
async function fetchActiveCampaignAssignments(
  admin: SupabaseClient,
  orgId: string
): Promise<{ campaign_id: string; agent_id: string }[]> {
  const all: { campaign_id: string; agent_id: string }[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from("campaign_assignments")
      .select("campaign_id, agent_id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("assigned_at", { ascending: true })
      .range(offset, offset + POSTGREST_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as { campaign_id: string; agent_id: string }[];
    all.push(...page);
    if (page.length < POSTGREST_PAGE_SIZE) break;
    offset += POSTGREST_PAGE_SIZE;
  }
  return all;
}

export async function resolveOpsReportCampaigns(
  admin: SupabaseClient,
  orgId: string,
  filters: Pick<OpsReportFilterParams, "campaignIds" | "leadTypes" | "regions">
): Promise<{ id: string; name: string }[]> {
  const { data, error } = await admin
    .from("campaigns")
    .select("id, name, client_id, lead_type, geography")
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);

  let rows = (data ?? []) as CampaignRow[];

  if (filters.campaignIds?.length) {
    const set = new Set(filters.campaignIds);
    rows = rows.filter((c) => set.has(c.id));
  }
  if (filters.leadTypes?.length) {
    rows = rows.filter((c) => campaignMatchesLeadTypes(c.lead_type, filters.leadTypes!));
  }
  if (filters.regions?.length) {
    const set = new Set(filters.regions.map((r) => r.trim().toLowerCase()));
    rows = rows.filter((c) => {
      const g = c.geography?.trim().toLowerCase();
      return Boolean(g && set.has(g));
    });
  }

  return rows.map((c) => ({ id: c.id, name: c.name }));
}

export async function resolveOpsReportAgentScope(
  admin: SupabaseClient,
  orgId: string,
  filters: Pick<OpsReportFilterParams, "tlIds" | "agentIds">,
  allAgentIds: Set<string>
): Promise<{ agentIds: Set<string>; restrictLeadsToAgents: boolean }> {
  const hasTl = Boolean(filters.tlIds?.length);
  const hasAgents = Boolean(filters.agentIds?.length);

  if (!hasTl && !hasAgents) {
    return { agentIds: allAgentIds, restrictLeadsToAgents: false };
  }

  let underTl = new Set<string>();

  if (hasTl) {
    const { data: usersWithRoles, error: usersError } = await admin
      .from("users")
      .select(
        "id, full_name, email, agent_code, status, reporting_manager_id, user_roles(roles(name))"
      )
      .eq("organization_id", orgId);

    if (usersError) throw new Error(usersError.message);

    const { data: campaigns, error: campaignsError } = await admin
      .from("campaigns")
      .select("id, assigned_team_leader_id")
      .eq("organization_id", orgId);

    if (campaignsError) throw new Error(campaignsError.message);

    const campaignList = (campaigns ?? []) as {
      id: string;
      assigned_team_leader_id: string | null;
    }[];

    const assignments = await fetchActiveCampaignAssignments(admin, orgId);

    const hierarchy = buildTeamHierarchy(
      (usersWithRoles ?? []) as unknown as Parameters<typeof buildTeamHierarchy>[0],
      campaignList,
      assignments
    );

    const tlSet = new Set(filters.tlIds);
    for (const tl of hierarchy.team_leaders) {
      if (!tlSet.has(tl.id)) continue;
      for (const agent of tl.agents) {
        if (allAgentIds.has(agent.id)) underTl.add(agent.id);
      }
    }
  }

  if (hasTl && !hasAgents) {
    return { agentIds: underTl, restrictLeadsToAgents: true };
  }

  if (!hasTl && hasAgents) {
    const selected = new Set(filters.agentIds!.filter((id) => allAgentIds.has(id)));
    return { agentIds: selected, restrictLeadsToAgents: true };
  }

  // TL + agents: only selected agents that belong under those TLs
  const selected = new Set(
    filters.agentIds!.filter((id) => underTl.has(id) && allAgentIds.has(id))
  );
  return { agentIds: selected, restrictLeadsToAgents: true };
}

export async function loadOpsReportFilterOptions(
  admin: SupabaseClient,
  orgId: string
): Promise<OpsReportFilterOptions> {
  const [
    { data: usersWithRoles, error: usersError },
    { data: campaigns, error: campaignsError },
  ] = await Promise.all([
    admin
      .from("users")
      .select(
        "id, full_name, email, agent_code, status, reporting_manager_id, user_roles(roles(name))"
      )
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("full_name"),
    admin
      .from("campaigns")
      .select("id, name, client_id, lead_type, geography, assigned_team_leader_id")
      .eq("organization_id", orgId)
      .order("name"),
  ]);

  if (usersError) throw new Error(usersError.message);
  if (campaignsError) throw new Error(campaignsError.message);

  const campaignList = (campaigns ?? []) as {
    id: string;
    name: string;
    client_id: string | null;
    lead_type: string | null;
    geography: string | null;
    assigned_team_leader_id: string | null;
  }[];

  const assignments = await fetchActiveCampaignAssignments(admin, orgId);

  const hierarchy = buildTeamHierarchy(
    (usersWithRoles ?? []) as unknown as Parameters<typeof buildTeamHierarchy>[0],
    campaignList,
    assignments
  );

  const team_leaders = hierarchy.team_leaders.map((tl) => ({
    id: tl.id,
    name: getTeamLeaderLabel(tl),
    agents: tl.agents.map((a) => ({ id: a.id, name: getTeamMemberLabel(a) })),
  }));

  const agents = [
    ...hierarchy.team_leaders.flatMap((tl) => tl.agents),
    ...hierarchy.unassigned_agents,
  ]
    .filter((a, idx, arr) => arr.findIndex((x) => x.id === a.id) === idx)
    .map((a) => ({ id: a.id, name: getTeamMemberLabel(a) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const leadTypeSet = new Set<string>();
  const regionSet = new Set<string>();
  for (const c of campaignList) {
    if (c.lead_type?.trim()) {
      for (const part of c.lead_type.split(/[,;]/)) {
        const v = part.trim();
        if (v) leadTypeSet.add(v);
      }
    }
    if (c.geography?.trim()) regionSet.add(c.geography.trim());
  }

  return {
    team_leaders,
    agents,
    campaigns: campaignList.map((c) => ({ id: c.id, name: c.name })),
    lead_types: [...leadTypeSet].sort((a, b) => a.localeCompare(b)),
    regions: [...regionSet].sort((a, b) => a.localeCompare(b)),
    channels: ["email", "telemarketing"],
    qa_statuses: [
      { value: "qualified", label: "Qualified" },
      { value: "disqualified", label: "Disqualified" },
      { value: "rectified", label: "Rectified" },
      { value: "tbd", label: "TBD / Pending" },
    ],
  };
}
