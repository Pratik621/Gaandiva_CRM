import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import {
  getProfile,
  getRoleNames,
  clampLimit,
  encodeCursor,
  decodeCursor,
} from "@/lib/command/db";
import {
  formatLeadHistoryAction,
  type HistoryRowMin,
} from "@/lib/command/format-lead-history-action";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { leadsToCsv } from "@/lib/leadsExport";
import { resolveLeadTypeForExport } from "@/lib/campaign-lead-type";
import type { Lead } from "@/types/lead.types";
import { getClientViewerCampaignIds, getClientViewerEmailCampaignOverride } from "@/lib/command/client-viewer-scope";
import {
  CLIENT_VIEWER_HIDDEN_EXPORT_KEYS,
  clientViewerHidesAppointment,
} from "@/lib/command/client-viewer-lead-columns";

export const dynamic = "force-dynamic";

type Sb = SupabaseClient<Database>;
type LeadsQ = ReturnType<Sb["from"]>;

type LeadIdOnlyRow = { id: string };
type ConsentRecordRow = {
  lead_id: string;
  consent_method: string | null;
  created_at: string;
};
type LeadRiskRow = { id: string; risk_flags: unknown };
type LeadHistoryListRow = {
  lead_id: string;
  change_type: string;
  new_value: unknown;
  old_value: unknown;
  reason: unknown;
  created_at: string;
};
type UserAttachRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  agent_code: string | null;
  employee_id: string | null;
};

function parseList(sp: URLSearchParams, key: string): string[] {
  const raw = sp.get(key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** PostgREST `.or()` ilike pattern; strips characters that break filter syntax. */
function toLeadSearchPattern(raw: string): string {
  const q = raw.trim().replace(/[,()]/g, " ").replace(/\s+/g, " ");
  if (!q) return "";
  const escaped = q.replace(/[%_\\]/g, (c) => `\\${c}`);
  return `%${escaped}%`;
}

function expandChannels(values: string[]): string[] {
  const out = new Set<string>();
  for (const c of values) {
    const x = c.toLowerCase();
    if (x === "tele" || x === "telemarketing") out.add("telemarketing");
    else if (x === "email") out.add("email");
  }
  return [...out];
}

function hasActiveRisk(flags: unknown): boolean {
  if (flags == null) return false;
  if (Array.isArray(flags)) return flags.length > 0;
  if (typeof flags === "object" && Object.keys(flags as object).length > 0) return true;
  return false;
}

function intersectIds(a: string[] | null, b: string[]): string[] {
  if (a === null) return b;
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

async function filterLeadIdsByConsentTypes(
  supabase: Sb,
  campaignId: string,
  organizationId: string,
  types: string[]
): Promise<string[]> {
  const { data: leads, error: le } = (await supabase
    .from("leads")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)) as {
    data: LeadIdOnlyRow[] | null;
    error: { message: string } | null;
  };
  if (le) throw new Error(le.message);
  const allIds = (leads ?? []).map((l) => l.id);

  const { data: records, error: re } = (await supabase
    .from("consent_records")
    .select("lead_id, consent_method, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })) as {
    data: ConsentRecordRow[] | null;
    error: { message: string } | null;
  };
  if (re) throw new Error(re.message);

  const latest = new Map<string, string>();
  for (const r of records ?? []) {
    const lid = r.lead_id;
    if (!latest.has(lid)) {
      latest.set(lid, String(r.consent_method ?? "").toLowerCase());
    }
  }

  const sel = new Set(types);
  const matched: string[] = [];
  for (const id of allIds) {
    const hasRecord = latest.has(id);
    const method = latest.get(id) ?? "";
    let ok = false;
    if (sel.has("landing_implicit") && hasRecord && (method === "digital" || method === "written")) {
      ok = true;
    }
    if (sel.has("tele_verbal") && hasRecord && method === "verbal") {
      ok = true;
    }
    if (sel.has("none") && !hasRecord) {
      ok = true;
    }
    if (ok) matched.push(id);
  }
  return matched;
}

async function filterLeadIdsWithRisk(
  supabase: Sb,
  campaignId: string,
  organizationId: string
): Promise<string[]> {
  const { data: rows, error } = (await supabase
    .from("leads")
    .select("id, risk_flags")
    .eq("campaign_id", campaignId)
    .eq("organization_id", organizationId)) as {
    data: LeadRiskRow[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(error.message);
  return (rows ?? [])
    .filter((r) => hasActiveRisk(r.risk_flags))
    .map((r) => r.id);
}

async function fetchLatestHistoryForLeads(
  supabase: Sb,
  leadIds: string[]
): Promise<Map<string, { label: string; at: string }>> {
  const map = new Map<string, { label: string; at: string }>();
  if (leadIds.length === 0) return map;
  const chunkSize = 100;
  for (let i = 0; i < leadIds.length; i += chunkSize) {
    const slice = leadIds.slice(i, i + chunkSize);
    const { data, error } = (await supabase
      .from("lead_history")
      .select("lead_id, change_type, new_value, old_value, reason, created_at")
      .in("lead_id", slice)
      .order("created_at", { ascending: false })
      .limit(15000)) as {
      data: LeadHistoryListRow[] | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const lid = row.lead_id;
      if (map.has(lid)) continue;
      map.set(lid, {
        label: formatLeadHistoryAction(row as HistoryRowMin),
        at: row.created_at,
      });
    }
  }
  return map;
}

const SORT_FIELDS = new Set([
  "created_at",
  "updated_at",
  "delivered_at",
  "name",
  "company_name",
  "job_title",
  "status",
  "consent_status",
  "channel",
  "assigned_agent_id",
  "appointment",
  "scored",
]);

function escapeCsvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const LEAD_LIST_SELECT = `*, 
  campaigns(id, name, campaign_id, client_id, client_name, status, start_date, end_date)`;

type LeadListRow = Record<string, unknown>;

async function attachAssignedUsers(supabase: Sb, rows: LeadListRow[]): Promise<LeadListRow[]> {
  const agentIds = [
    ...new Set(
      rows.map((r) => r.assigned_agent_id as string | null).filter((x): x is string => Boolean(x))
    ),
  ];
  if (agentIds.length === 0) return rows;
  const { data: users, error } = (await supabase
    .from("users")
    .select("id, full_name, email, agent_code, employee_id")
    .in("id", agentIds)) as {
    data: UserAttachRow[] | null;
    error: { message: string } | null;
  };
  if (error) return rows;
  const byId = new Map((users ?? []).map((u) => [u.id, u]));
  return rows.map((r) => {
    const aid = r.assigned_agent_id as string | null;
    return {
      ...r,
      assigned_user: aid ? (byId.get(aid) ?? null) : null,
    };
  });
}

async function enrichWithHistory(
  supabase: Sb,
  rows: LeadListRow[]
): Promise<LeadListRow[]> {
  const ids = rows.map((r) => r.id as string);
  let histMap = new Map<string, { label: string; at: string }>();
  try {
    histMap = await fetchLatestHistoryForLeads(supabase, ids);
  } catch {
    /* non-fatal */
  }
  return rows.map((row) => {
    const h = histMap.get(row.id as string);
    return {
      ...row,
      last_action: h?.label ?? null,
      last_action_at: h?.at ?? null,
    };
  });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getProfile(supabase, user.id);
  const orgId = profile?.organization_id ?? "";

  const sp = request.nextUrl.searchParams;
  const campaignId = sp.get("campaign_id");
  const status = sp.get("status");
  const statusInRaw = sp.get("status_in");
  const consentStatus = sp.get("consent_status");
  const consentStatusIn = parseList(sp, "consent_status_in");
  const channel = sp.get("channel");
  const channelIn = parseList(sp, "channel_in");
  const leadTaggingIn = parseList(sp, "lead_tagging_in");
  const repUserIdsIn = parseList(sp, "rep_user_ids_in");
  const dateFrom = sp.get("date_from")?.trim() || null;
  const dateTo = sp.get("date_to")?.trim() || null;
  const consentTypeIn = parseList(sp, "consent_type_in");
  const riskActive = sp.get("risk_active") === "1" || sp.get("risk_active") === "true";
  const deliveryStatus = sp.get("delivery_status")?.trim().toLowerCase() || null;
  const searchRaw = (sp.get("q") ?? sp.get("search") ?? "").trim();
  const searchPattern = toLeadSearchPattern(searchRaw);
  const formatCsv = sp.get("format") === "csv";

  const cursor = sp.get("cursor");
  const offsetRaw = sp.get("offset");
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = clampLimit(sp.get("limit") ?? "10");
  const useOffset =
    offsetRaw !== null && offsetRaw !== "" || sp.has("page") || !cursor;
  const offset = offsetRaw !== null && offsetRaw !== ""
    ? Math.max(0, parseInt(offsetRaw ?? "0", 10) || 0)
    : (page - 1) * limit;

  const isClientViewer = userRoles.includes("client_viewer");
  const sortField = sp.get("sort") ?? "";
  const sortDir = (sp.get("sort_dir") ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const defaultSortCol = isClientViewer ? "delivered_at" : "created_at";
  const sortCol = SORT_FIELDS.has(sortField) ? sortField : defaultSortCol;

  const emptyResponse = () => {
    if (formatCsv) {
      const csv = leadsToCsv([] as Lead[]);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="leads.csv"',
        },
      });
    }
    return NextResponse.json({
      leads: [],
      total: 0,
      limit,
      offset: useOffset ? offset : undefined,
      nextCursor: null,
      hasMore: false,
    });
  };

  let clientViewerCampaignIds: string[] | null = null;
  if (isClientViewer) {
    const hasOverride = getClientViewerEmailCampaignOverride(user.email) !== null;
    if ((!profile?.client_id && !hasOverride) || !orgId) {
      return emptyResponse();
    }
    try {
      clientViewerCampaignIds = await getClientViewerCampaignIds(
        supabase,
        orgId,
        profile?.client_id ?? null,
        user.email
      );
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to resolve campaigns" },
        { status: 500 }
      );
    }
    if (clientViewerCampaignIds.length === 0) {
      return emptyResponse();
    }
    if (campaignId && !clientViewerCampaignIds.includes(campaignId)) {
      return emptyResponse();
    }
  }

  let idRestriction: string[] | null = null;

  try {
    if (riskActive && campaignId) {
      const riskIds = await filterLeadIdsWithRisk(supabase, campaignId, orgId);
      idRestriction = intersectIds(idRestriction, riskIds);
    }

    if (consentTypeIn.length > 0 && campaignId) {
      const cIds = await filterLeadIdsByConsentTypes(supabase, campaignId, orgId, consentTypeIn);
      idRestriction = intersectIds(idRestriction, cIds);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Filter error" },
      { status: 500 }
    );
  }

  if (idRestriction !== null && idRestriction.length === 0) {
    return emptyResponse();
  }

  const dateColumn = clientViewerCampaignIds !== null ? "delivered_at" : "created_at";

  const applyFilters = (q: LeadsQ) => {
    let x = q
      .select(LEAD_LIST_SELECT, { count: "exact" })
      .eq("organization_id", orgId);

    if (campaignId) x = x.eq("campaign_id", campaignId);
    if (idRestriction !== null) x = x.in("id", idRestriction);

    const statusInList = statusInRaw
      ? statusInRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    if (statusInList.length > 0) {
      x = x.in("status", statusInList);
    } else if (status) {
      x = x.eq("status", status);
    }

    if (consentStatusIn.length > 0) {
      x = x.in("consent_status", consentStatusIn);
    } else if (consentStatus) {
      x = x.eq("consent_status", consentStatus);
    }

    const chExpanded = channelIn.length > 0 ? expandChannels(channelIn) : [];
    if (chExpanded.length > 0) {
      x = x.in("channel", chExpanded);
    } else if (channel) {
      const one = expandChannels([channel])[0] ?? channel;
      x = x.eq("channel", one);
    }

    if (leadTaggingIn.length > 0) {
      x = x.in("lead_tagging", leadTaggingIn);
    }

    if (repUserIdsIn.length > 0) {
      x = x.in("assigned_agent_id", repUserIdsIn);
    }

    if (dateFrom) {
      x = x.gte(dateColumn, `${dateFrom}T00:00:00.000Z`);
    }
    if (dateTo) {
      x = x.lte(dateColumn, `${dateTo}T23:59:59.999Z`);
    }

    if (searchPattern) {
      x = x.or(
        `lead_id.ilike.${searchPattern},name.ilike.${searchPattern},first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},company_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`
      );
    }

    if (clientViewerCampaignIds !== null) {
      x = x.in("campaign_id", clientViewerCampaignIds);
      x = x.eq("delivery_status", "delivered");
    } else if (deliveryStatus === "delivered" || deliveryStatus === "not_delivered") {
      x = x.eq("delivery_status", deliveryStatus);
    }

    return x;
  };

  const baseForOffset = applyFilters(supabase.from("leads"));
  if (baseForOffset === null) {
    return NextResponse.json({ leads: [], total: 0, limit, nextCursor: null, hasMore: false });
  }

  const baseForCursor = applyFilters(supabase.from("leads"));
  if (baseForCursor === null) {
    return NextResponse.json({ leads: [], total: 0, limit, nextCursor: null, hasMore: false });
  }

  const orderedOffsetQuery = baseForOffset
    .order(sortCol as "created_at", { ascending: sortDir === "asc", nullsFirst: false })
    .order("id", { ascending: sortDir === "asc" });

  const orderedCursorQuery = baseForCursor
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  // Voice recordings load lazily via POST /api/leads/voice-recordings.
  const attachVoiceIfCampaign = async (rows: LeadListRow[]): Promise<LeadListRow[]> => rows;

  const rowDisplayName = (row: LeadListRow) => {
    const fn = (row.first_name as string | null) ?? "";
    const ln = (row.last_name as string | null) ?? "";
    const combined = [fn, ln].filter(Boolean).join(" ").trim();
    return combined || (row.name as string | null) || "";
  };

  const toCsv = async (rows: LeadListRow[]) => {
    const withUsers = await attachAssignedUsers(supabase, rows);
    const withHist = await enrichWithHistory(supabase, withUsers);

    const campaignMetaById = new Map<
      string,
      {
        name: string;
        lead_type: string;
        campaign_type: string | null;
        team_leader_name: string;
      }
    >();
    if (campaignId) {
      const { data: camp } = await supabase
        .from("campaigns")
        .select("name, lead_type, campaign_type, assigned_team_leader_id")
        .eq("id", campaignId)
        .maybeSingle();
      const row = camp as {
        name?: string;
        lead_type?: string | null;
        campaign_type?: string | null;
        assigned_team_leader_id?: string | null;
      } | null;
      const name = row?.name?.trim();
      let teamLeaderName = "";
      if (row?.assigned_team_leader_id) {
        const { data: tl } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", row.assigned_team_leader_id)
          .maybeSingle();
        const tlRow = tl as { full_name: string | null; email: string | null } | null;
        teamLeaderName = tlRow?.full_name?.trim() || tlRow?.email?.trim() || "";
      }
      if (name) {
        campaignMetaById.set(campaignId, {
          name,
          lead_type: row?.lead_type?.trim() ?? "",
          campaign_type: row?.campaign_type?.trim() ?? null,
          team_leader_name: teamLeaderName,
        });
      }
    } else {
      const ids = [
        ...new Set(
          withHist
            .map((r) => r.campaign_id as string | null | undefined)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (ids.length > 0) {
        const { data: camps } = await supabase
          .from("campaigns")
          .select("id, name, lead_type, campaign_type, assigned_team_leader_id")
          .in("id", ids);
        const campRows = (camps ?? []) as {
          id: string;
          name: string;
          lead_type: string | null;
          campaign_type: string | null;
          assigned_team_leader_id: string | null;
        }[];
        const tlIds = [
          ...new Set(
            campRows
              .map((c) => c.assigned_team_leader_id)
              .filter((id): id is string => Boolean(id))
          ),
        ];
        const tlNameById = new Map<string, string>();
        if (tlIds.length > 0) {
          const { data: tls } = await supabase
            .from("users")
            .select("id, full_name, email")
            .in("id", tlIds);
          for (const u of (tls ?? []) as {
            id: string;
            full_name: string | null;
            email: string | null;
          }[]) {
            tlNameById.set(u.id, u.full_name?.trim() || u.email?.trim() || "");
          }
        }
        campRows.forEach((c) => {
          if (c.name?.trim()) {
            campaignMetaById.set(c.id, {
              name: c.name.trim(),
              lead_type: c.lead_type?.trim() ?? "",
              campaign_type: c.campaign_type?.trim() ?? null,
              team_leader_name: c.assigned_team_leader_id
                ? tlNameById.get(c.assigned_team_leader_id) ?? ""
                : "",
            });
          }
        });
      }
    }

    const withCampaignNames = withHist.map((row) => {
      const cid = row.campaign_id as string | null | undefined;
      const meta = cid ? campaignMetaById.get(cid) : undefined;
      return {
        ...row,
        campaign_name: meta?.name ?? "",
        lead_type: resolveLeadTypeForExport(
          row.lead_type as string | null | undefined,
          meta?.lead_type
        ),
        team_leader_name: meta?.team_leader_name ?? "",
      };
    });

    const singleCampaignMeta = campaignId ? campaignMetaById.get(campaignId) : undefined;
    const hideAppointmentExport =
      isClientViewer &&
      clientViewerHidesAppointment(singleCampaignMeta?.campaign_type);
    return leadsToCsv(
      withCampaignNames as unknown as Lead[],
      singleCampaignMeta?.name,
      singleCampaignMeta?.lead_type,
      hideAppointmentExport
        ? {
            excludeKeys: CLIENT_VIEWER_HIDDEN_EXPORT_KEYS,
            teamLeaderName: singleCampaignMeta?.team_leader_name,
          }
        : { teamLeaderName: singleCampaignMeta?.team_leader_name }
    );
  };

  if (formatCsv) {
    const MAX_ROWS = 10000;
    const allRows: LeadListRow[] = [];
    let from = 0;
    while (allRows.length < MAX_ROWS) {
      const batchSize = Math.min(500, MAX_ROWS - allRows.length);
      const { data: batch, error } = await orderedOffsetQuery.range(from, from + batchSize - 1);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const chunk = (batch ?? []) as LeadListRow[];
      allRows.push(...chunk);
      if (chunk.length < batchSize) break;
      from += batchSize;
    }
    const csv = await toCsv(allRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="leads.csv"',
      },
    });
  }

  if (useOffset) {
    const { data: leads, count, error } = await orderedOffsetQuery.range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (leads ?? []) as LeadListRow[];
    const total = count ?? 0;
    const withUsers = await attachAssignedUsers(supabase, rows);
    const enriched = await enrichWithHistory(supabase, withUsers);
    const withVoice = await attachVoiceIfCampaign(enriched);

    return NextResponse.json({
      leads: withVoice,
      total,
      limit,
      offset,
      page: Math.floor(offset / limit) + 1,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      nextCursor: null,
      hasMore: offset + rows.length < total,
    });
  }

  let legacyQuery = orderedCursorQuery.limit(limit + 1);
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      legacyQuery = legacyQuery.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
      );
    }
  }

  const { data: leads, count, error } = await legacyQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (leads ?? []) as LeadListRow[];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor(last.id as string, last.created_at as string)
      : null;

  const withUsers = await attachAssignedUsers(supabase, items);
  const enriched = await enrichWithHistory(supabase, withUsers);
  const withVoice = await attachVoiceIfCampaign(enriched);

  return NextResponse.json({
    leads: withVoice,
    total: count ?? 0,
    limit,
    nextCursor,
    hasMore,
  });
}
