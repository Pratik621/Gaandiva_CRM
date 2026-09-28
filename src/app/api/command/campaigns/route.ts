import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import {
  getProfile,
  getRoleNames,
  upsertCampaignMetrics,
  appendCampaignMetricsHistory,
  clampLimit,
  encodeCursor,
  decodeCursor,
  aggregateCommandLeadStatsByCampaign,
  aggregateUnresolvedAlertsByCampaign,
  aggregateDqOverrideAlertCountsByCampaign,
  aggregateCommandCampaignStatusSummary,
  type CommandListLeadAgg,
  type CommandListAlertAgg,
} from "@/lib/command/db";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { parsedRowsToLeadInserts } from "@/lib/command/campaignFormLeadPayloads";
import { createNotifications } from "@/lib/notifications";
import { normalizeRoleName } from "@/lib/auth/config";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import {
  campaignQuestionsToDbValue,
  normalizeCampaignQuestions,
} from "@/lib/campaign-questions";
import { normalizeRevenueSize } from "@/lib/campaign/revenue-size";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  formatCampaignAlertTimestamp,
  sendClientViewerCampaignAlertEmail,
} from "@/lib/email/client-viewer-campaign-alerts";
import {
  applyClientViewerCampaignListScope,
  buildClientViewerCampaignScope,
  clientViewerScopeHasAccess,
} from "@/lib/command/client-viewer-scope";
import { createCampaignLog } from "@/lib/campaign-logs";

export const dynamic = "force-dynamic";

/** In-app recipients when a client viewer creates a campaign. */
const CLIENT_VIEWER_CAMPAIGN_NOTIFY_ROLES = new Set([
  "internal_operator",
  "operations_manager",
  "sales_manager",
]);

const COMMAND_CAMPAIGN_LEAD_IMPORT_MAX = 500;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  const isAllowed = hasCommandRole(userRoles) || userRoles.includes("client_viewer");
  if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const profile = await getProfile(supabase, user.id);

  const sp = request.nextUrl.searchParams;

  if (sp.get("enrich") === "1") {
    const orgId = profile?.organization_id ?? "";
    const { page, limit, offset } = parseListPagination(sp);
    const qRaw = sp.get("q")?.trim() ?? "";
    const statusGroup = (sp.get("status") ?? "all").toLowerCase();
    const dateFrom = sp.get("date_from")?.trim() ?? "";
    const dateTo = sp.get("date_to")?.trim() ?? "";

    const clientViewerScope = buildClientViewerCampaignScope(
      user.email,
      profile?.client_id ?? null
    );
    const emptySummary = {
      total: 0,
      active: 0,
      completed: 0,
      paused: 0,
      draft: 0,
    };

    if (userRoles.includes("client_viewer") && !clientViewerScopeHasAccess(clientViewerScope)) {
      return NextResponse.json({
        campaigns: [],
        total: 0,
        summary: emptySummary,
        truncated: false,
        limit,
        pagination: buildPaginationMeta(page, limit, 0),
      });
    }

    const scopeFilters = {
      organizationId: orgId,
      clientId:
        userRoles.includes("client_viewer") && clientViewerScope.mode === "client"
          ? clientViewerScope.clientId
          : null,
      campaignIds:
        userRoles.includes("client_viewer") && clientViewerScope.mode === "campaign_ids"
          ? clientViewerScope.campaignIds
          : null,
      qRaw,
      dateFrom,
      dateTo,
    };

    let listQuery = supabase
      .from("campaigns")
      .select(
        `id, campaign_id, campaign_code, name, description, status, start_date, end_date,
         client_id, client_name, lead_type, campaign_type, cpl, revenue, total_allocation, achieved,
         pending_allocation, industry, geography, created_at, created_by,
         campaign_metrics(
           sponsor_name,
           total_leads_allocated,
           total_campaign_spend,
           total_leads_delivered,
           daily_reporting,
           channel_split,
           deficit_leads,
           lead_increment,
           lead_replace
         )`,
        { count: "exact" }
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userRoles.includes("client_viewer")) {
      listQuery = applyClientViewerCampaignListScope(listQuery, clientViewerScope);
    }

    if (qRaw.length > 0) {
      const safe = qRaw.replace(/%/g, "").replace(/_/g, "");
      if (safe.length > 0) listQuery = listQuery.ilike("name", `%${safe}%`);
    }

    if (statusGroup === "active") listQuery = listQuery.eq("status", "active");
    if (statusGroup === "completed") listQuery = listQuery.eq("status", "completed");

    if (dateFrom && dateTo) {
      listQuery = listQuery
        .or(`start_date.is.null,start_date.lte.${dateTo}`)
        .or(`end_date.is.null,end_date.gte.${dateFrom}`);
    } else if (dateFrom) {
      listQuery = listQuery.or(`end_date.is.null,end_date.gte.${dateFrom}`);
    } else if (dateTo) {
      listQuery = listQuery.or(`start_date.is.null,start_date.lte.${dateTo}`);
    }

    const [{ data: listRows, count, error: listErr }, summary] = await Promise.all([
      listQuery,
      aggregateCommandCampaignStatusSummary(supabase, scopeFilters).catch(() => emptySummary),
    ]);
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const rows = (listRows ?? []) as Record<string, unknown>[];
    const createdByIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => typeof id === "string" && id.length > 0))];
    const creatorNameById: Record<string, string> = {};
    if (createdByIds.length > 0) {
      const admin = getAdminClientSafe();
      const usersClient = admin ?? supabase;
      let usersQuery = usersClient
        .from("users")
        .select("id, full_name, email")
        .in("id", createdByIds);
      if (admin && orgId) {
        usersQuery = usersQuery.eq("organization_id", orgId);
      }
      const { data: usersData } = await usersQuery;
      ((usersData ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        creatorNameById[u.id] = u.full_name || u.email || "Unknown";
      });
    }
    const ids = rows.map((r) => r.id as string);

    let leadAgg: Record<string, CommandListLeadAgg> = {};
    let alertAgg: Record<string, CommandListAlertAgg> = {};
    let dqOverrideAgg: Record<string, number> = {};
    if (ids.length > 0) {
      try {
        [leadAgg, alertAgg, dqOverrideAgg] = await Promise.all([
          aggregateCommandLeadStatsByCampaign(supabase, orgId, ids),
          aggregateUnresolvedAlertsByCampaign(supabase, orgId, ids),
          aggregateDqOverrideAlertCountsByCampaign(supabase, orgId, ids),
        ]);
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Aggregation failed" },
          { status: 500 }
        );
      }
    }

    const emptyLead = (): CommandListLeadAgg => ({
      total: 0,
      qualified: 0,
      delivered: 0,
      qa_verified: 0,
      dq: 0,
      missingConsent: 0,
      disputedConsent: 0,
      pendingConsent: 0,
      verified: 0,
    });
    const emptyAlert = (): CommandListAlertAgg => ({
      count: 0,
      hasRed: false,
      hasYellow: false,
    });

    const enriched = rows.map((c) => {
      const id = c.id as string;
      const L = leadAgg[id] ?? emptyLead();
      const A = alertAgg[id] ?? emptyAlert();
      const qualifiedPct = L.total > 0 ? Math.round((L.qualified / L.total) * 1000) / 10 : 0;
      const qaVerifiedPct = L.total > 0 ? Math.round((L.qa_verified / L.total) * 100) : 0;
      const consentIssues = L.missingConsent + L.disputedConsent;
      const overrideCount = dqOverrideAgg[id] ?? 0;
      const totalAllocation = Number(c.total_allocation ?? 0) || 0;
      const achievedCount = L.delivered;
      const remainingAllocation = Math.max(0, totalAllocation - achievedCount);
      return {
        ...c,
        created_by_name:
          creatorNameById[(c.created_by as string | undefined) ?? ""] ??
          ((c.created_by as string | undefined) ? "Unknown" : null),
        achieved: achievedCount,
        pending_allocation: remainingAllocation,
        list_stats: {
          total_leads: L.total,
          delivered_count: L.delivered,
          qualified_count: L.qualified,
          qualified_pct: qualifiedPct,
          qa_verified_pct: qaVerifiedPct,
          override_count: overrideCount,
          consent_issues_count: consentIssues,
          dq_count: L.dq,
          unresolved_alerts: A.count,
        },
      };
    });

    const total = count ?? 0;
    return NextResponse.json({
      campaigns: enriched,
      total,
      summary,
      truncated: total > limit,
      limit,
      pagination: buildPaginationMeta(page, limit, total),
    });
  }

  const cursor = sp.get("cursor");
  const limit = clampLimit(sp.get("limit") ?? "25");

  let query = supabase
    .from("campaigns")
    .select(
      `id, campaign_id, campaign_code, name, description, status, start_date, end_date,
       client_id, client_name, lead_type, campaign_type, cpl, revenue, total_allocation, achieved,
       pending_allocation, industry, geography, created_at, created_by,
       campaign_metrics(
         sponsor_name,
         total_leads_allocated,
         total_campaign_spend,
         total_leads_delivered,
         daily_reporting,
         channel_split,
         deficit_leads,
         lead_increment,
         lead_replace
       )`,
      { count: "exact" }
    )
    .eq("organization_id", profile?.organization_id ?? "")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  const clientViewerScope = buildClientViewerCampaignScope(
    user.email,
    profile?.client_id ?? null
  );

  // client_viewer: restrict to their bound client's campaigns (or email override)
  if (userRoles.includes("client_viewer")) {
    if (!clientViewerScopeHasAccess(clientViewerScope) || !profile?.organization_id) {
      return NextResponse.json({ campaigns: [], total: 0, limit, nextCursor: null, hasMore: false });
    }
    query = applyClientViewerCampaignListScope(query, clientViewerScope);
  }

  // Cursor-based pagination
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      query = query.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`
      );
    }
  }

  const { data: campaigns, count, error } = await query;
  if (error) {
    const msg = error.message ?? "Failed to create campaign";
    const isDuplicateCampaignId =
      msg.includes("campaigns_campaign_id_unique") ||
      msg.toLowerCase().includes("duplicate key value");
    return NextResponse.json(
      {
        error: isDuplicateCampaignId
          ? "Campaign ID already exists. Please use a different Campaign ID."
          : msg,
      },
      { status: isDuplicateCampaignId ? 409 : 500 }
    );
  }

  const rows = (campaigns ?? []) as Record<string, unknown>[];
  const createdByIds = [...new Set(rows.map((r) => r.created_by).filter((id): id is string => typeof id === "string" && id.length > 0))];
  const creatorNameById: Record<string, string> = {};
  if (createdByIds.length > 0) {
    const admin = getAdminClientSafe();
    const usersClient = admin ?? supabase;
    let usersQuery = usersClient
      .from("users")
      .select("id, full_name, email")
      .in("id", createdByIds);
    if (admin && profile?.organization_id) {
      usersQuery = usersQuery.eq("organization_id", profile.organization_id);
    }
    const { data: usersData } = await usersQuery;
    ((usersData ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
      creatorNameById[u.id] = u.full_name || u.email || "Unknown";
    });
  }
  const hasMore = rows.length > limit;
  const items: Record<string, unknown>[] = (hasMore ? rows.slice(0, limit) : rows).map((row) => ({
    ...row,
    created_by_name:
      creatorNameById[(row.created_by as string | undefined) ?? ""] ??
      ((row.created_by as string | undefined) ? "Unknown" : null),
  }));
  const last = items[items.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor(last.id as string, last.created_at as string)
      : null;

  return NextResponse.json({ campaigns: items, total: count ?? 0, limit, nextCursor, hasMore });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  const isCommand = hasCommandRole(userRoles);
  const isClientViewer = userRoles.includes("client_viewer");
  if (!isCommand && !isClientViewer) {
    return NextResponse.json(
      { error: "Forbidden — requires client_viewer or internal_operator (or higher)" },
      { status: 403 }
    );
  }

  const profile = await getProfile(supabase, user.id);
  const body = (await request.json()) as Record<string, unknown>;
  const admin = getAdminClientSafe();

  let insertClientId = (body.client_id as string | null) ?? null;
  if (!isCommand && isClientViewer) {
    if (!profile?.client_id) {
      return NextResponse.json(
        { error: "Forbidden — your account has no client assigned; contact an administrator." },
        { status: 403 }
      );
    }
    insertClientId = profile.client_id;
  }

  let resolvedClientName = (body.client_name as string | null) ?? null;
  if (insertClientId && !resolvedClientName) {
    if (admin) {
      const { data: clientRow } = await admin
        .from("clients")
        .select("company_name")
        .eq("id", insertClientId as string)
        .single();
      resolvedClientName = (clientRow as { company_name?: string | null } | null)?.company_name ?? null;
    }
  }

  if (isClientViewer && !admin) {
    return NextResponse.json(
      { error: "Admin API not configured. Set SUPABASE_SERVICE_ROLE_KEY in deployment environment." },
      { status: 503 }
    );
  }

  // client_viewer inserts must bypass campaigns RLS; API authorization above enforces scope.
  const writeClient = isClientViewer && admin ? admin : supabase;

  const { data: campaign, error } = (await writeClient
    .from("campaigns")
    .insert({
      organization_id: (profile?.organization_id ?? "") as string,
      campaign_id: body.campaign_id as string,
      name: body.name as string,
      description: (body.description as string | null) ?? null,
      industry: (body.industry as string | null) ?? null,
      geography: (body.geography as string | null) ?? null,
      revenue_size: normalizeRevenueSize(body.revenue_size),
      start_date: (body.start_date as string | null) ?? null,
      end_date: (body.end_date as string | null) ?? null,
      status: (body.status as string) ?? "active",
      client_id: insertClientId,
      client_name: resolvedClientName,
      lead_type: (body.lead_type as string | null) ?? null,
      campaign_type: (body.campaign_type as string | null) ?? null,
      cpl: (body.cpl as number | null) ?? null,
      revenue: (body.revenue as number | null) ?? null,
      total_allocation: (body.total_allocation as number | null) ?? null,
      lead_aggregated: (body.lead_aggregated as string | null)?.trim() || null,
      campaign_questions: campaignQuestionsToDbValue(
        normalizeCampaignQuestions(body.campaign_questions)
      ),
      created_by: user.id,
    } as never)
    .select()
    .single()) as unknown as {
    data: {
      id: string;
      campaign_id: string | null;
      name: string | null;
      client_name: string | null;
      created_at: string | null;
    } | null;
    error: { message: string } | null;
  };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const hasMetricsPayload =
    "sponsor_name" in body ||
    "total_leads_allocated" in body ||
    "total_campaign_spend" in body ||
    "total_leads_delivered" in body ||
    "daily_reporting" in body ||
    "channel_split" in body ||
    "deficit_leads" in body ||
    "lead_increment" in body ||
    "lead_replace" in body;

  if (hasMetricsPayload) {
    const historyPayload = {
      date: (body.metric_date as string | null) ?? undefined,
      total_leads_delivered: (body.total_leads_delivered as number) ?? 0,
      channel_split: (body.channel_split as Record<string, unknown> | null) ?? {},
      deficit_leads: (body.deficit_leads as number) ?? 0,
      lead_increment: (body.lead_increment as number) ?? 0,
      lead_replace: (body.lead_replace as number) ?? 0,
      total_campaign_spend: (body.total_campaign_spend as number) ?? 0,
      updated_by: user.id,
    };
    await upsertCampaignMetrics(
      writeClient,
      (campaign as unknown as { id: string }).id,
      {
        sponsor_name: (body.sponsor_name as string | null) ?? null,
        total_leads_allocated: (body.total_leads_allocated as number) ?? 0,
        total_campaign_spend: (body.total_campaign_spend as number) ?? 0,
        total_leads_delivered: (body.total_leads_delivered as number) ?? 0,
        daily_reporting: (body.daily_reporting as Record<string, unknown> | null) ?? {},
        channel_split: (body.channel_split as Record<string, unknown> | null) ?? {},
        deficit_leads: (body.deficit_leads as number) ?? 0,
        lead_increment: (body.lead_increment as number) ?? 0,
        lead_replace: (body.lead_replace as number) ?? 0,
      }
    );
    await appendCampaignMetricsHistory(
      writeClient,
      (campaign as unknown as { id: string }).id,
      historyPayload
    );
  }

  // Optional bulk lead import from campaign create form
  const rawLeads = Array.isArray(body.leads)
    ? (body.leads as Record<string, unknown>[])
    : [];
  if (rawLeads.length > COMMAND_CAMPAIGN_LEAD_IMPORT_MAX) {
    return NextResponse.json(
      { error: `Maximum ${COMMAND_CAMPAIGN_LEAD_IMPORT_MAX} leads per import` },
      { status: 400 }
    );
  }
  if (rawLeads.length > 0) {
    const leadPayloads = parsedRowsToLeadInserts(rawLeads, {
      organizationId: (profile?.organization_id ?? "") as string,
      campaignId: (campaign as { id: string }).id,
      createdBy: user.id,
    });

    if (leadPayloads.length > 0) {
      const { error: insertLeadsError } = await writeClient
        .from("leads")
        .insert(leadPayloads as never);
      if (insertLeadsError) {
        return NextResponse.json({ error: insertLeadsError.message }, { status: 500 });
      }
    }
  }

  // Notify ops/sales managers and internal operators when a client viewer creates a campaign.
  if (isClientViewer) {
    const creatorName =
      (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
      user.user_metadata?.full_name?.toString()?.trim() ||
      user.email ||
      "Unknown User";
    const creatorEmail = user.email ?? "unknown-email";
    const createdAt = formatCampaignAlertTimestamp(campaign?.created_at);
    await sendClientViewerCampaignAlertEmail({
      campaignName: (campaign?.name ?? String(body.name ?? "Untitled Campaign")).trim(),
      campaignId: (campaign?.campaign_id ?? String(body.campaign_id ?? "")).trim() || "N/A",
      clientName: (campaign?.client_name ?? resolvedClientName ?? "N/A").trim() || "N/A",
      createdAt,
      creatorName,
      creatorEmail,
    });

    if (admin) {
      const orgId = (profile?.organization_id ?? "") as string;
      const { data: roleRows } = await admin
        .from("roles")
        .select("id, name")
        .eq("organization_id", orgId);

      const notifyRoleIds = ((roleRows ?? []) as { id: string; name: string | null }[])
        .filter((r) => CLIENT_VIEWER_CAMPAIGN_NOTIFY_ROLES.has(normalizeRoleName(r.name)))
        .map((r) => r.id);

      if (notifyRoleIds.length > 0) {
        const { data: notifyRoleLinks } = await admin
          .from("user_roles")
          .select("user_id")
          .in("role_id", notifyRoleIds);

        const receiverIds = [
          ...new Set(((notifyRoleLinks ?? []) as { user_id: string }[]).map((r) => r.user_id)),
        ].filter((id) => id && id !== user.id);

        if (receiverIds.length > 0) {
          await createNotifications(
            receiverIds.map((receiverId) => ({
              title: "New Campaign Created",
              message: `Client viewer created campaign "${String(body.name ?? "Untitled Campaign")}".`,
              type: "campaign" as const,
              sender_id: user.id,
              receiver_id: receiverId,
              reference_type: "campaign" as const,
              reference_id: (campaign as { id: string }).id,
              organization_id: orgId,
            }))
          );
        }
      }
    }
  }

  const campRow = campaign as { id: string; name: string | null };
  const campName = String(campRow.name ?? body.name ?? "Untitled Campaign");

  void createCampaignLog(writeClient, {
    campaign_id: campRow.id,
    action: "campaign_created",
    message: `Campaign "${campName}" created`,
    created_by: user.id,
  });

  void logAudit({
    organizationId: (profile?.organization_id ?? "") as string,
    actorId: user.id,
    actorRole: resolvePrimaryAuditRole(userRoles),
    category: "campaigns",
    eventType: "campaign_created",
    description: `Created campaign "${campName}"`,
    targetType: "campaign",
    targetId: campRow.id,
    targetLabel: campName,
    metadata: {
      campaign_display_id: (campaign as { campaign_id?: string | null }).campaign_id ?? null,
      status: (body.status as string) ?? "active",
      client_name: resolvedClientName,
      source: isClientViewer ? "command_client_viewer" : "command_campaigns",
    },
    request,
  });

  return NextResponse.json({ campaign }, { status: 201 });
}
