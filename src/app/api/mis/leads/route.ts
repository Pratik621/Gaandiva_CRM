import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import { resolveLeadTypeForExport } from "@/lib/campaign-lead-type";
import {
  TL_LEADS_LIST_SELECT,
  fetchAllTlLeadsForCampaigns,
  fetchTlLeadsPageForCampaigns,
} from "@/lib/tl/leads-list";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);
    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[]).map((r) =>
      r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_")
    );
    const canView =
      roleNames.includes("mis") ||
      roleNames.includes("admin") ||
      roleNames.includes("email_marketing_manager");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden: MIS or Admin role required" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const sp = request.nextUrl.searchParams;
    const exportAll = sp.get("export") === "all";
    const { page, limit, offset } = parseListPagination(sp);
    const searchRaw = sp.get("q")?.trim() || "";
    const dateFrom = sp.get("date_from")?.trim() || undefined;
    const dateTo = sp.get("date_to")?.trim() || undefined;
    const agentIdsParam = sp.get("agent_ids")?.trim() || "";
    const agentIds = agentIdsParam
      ? agentIdsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    const includeUnassigned = sp.get("include_unassigned") === "1";
    const realAgentIds = agentIds.filter((id) => id !== "__unassigned__");
    const wantsUnassigned =
      includeUnassigned || agentIds.includes("__unassigned__");
    const qaStatus = sp.get("qa_status")?.trim() || undefined;

    const { data: campaigns, error: campaignsError } = await admin
      .from("campaigns")
      .select("id, name, lead_type")
      .eq("organization_id", orgId);

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaignList = (campaigns ?? []) as { id: string; name: string; lead_type: string | null }[];
    if (campaignList.length === 0) {
      return NextResponse.json({
        leads: [],
        pagination: buildPaginationMeta(page, limit, 0),
        agents: [],
      });
    }

    const campaignIds = campaignList.map((c) => c.id);
    const campaignMeta = campaignList.reduce<
      Record<string, { name: string; lead_type: string | null }>
    >((acc, c) => {
      acc[c.id] = { name: c.name ?? "—", lead_type: c.lead_type ?? null };
      return acc;
    }, {});

    const leadsQueryOpts = {
      campaignIds,
      organizationId: orgId,
      search: searchRaw || undefined,
      select: TL_LEADS_LIST_SELECT,
      ...(agentIds.length > 0
        ? {
            agentIds: realAgentIds.length > 0 ? realAgentIds : undefined,
            includeUnassigned: wantsUnassigned,
          }
        : {}),
      dateFrom,
      dateTo,
      qaStatus,
    };

    const [{ rows: rawLeads, total }, assignmentsRes] = await Promise.all([
      exportAll
        ? fetchAllTlLeadsForCampaigns(admin, leadsQueryOpts)
        : fetchTlLeadsPageForCampaigns(admin, {
            ...leadsQueryOpts,
            offset,
            limit,
          }),
      admin
        .from("campaign_assignments")
        .select("agent_id")
        .eq("organization_id", orgId)
        .eq("is_active", true),
    ]);

    const assignmentAgentIds = [
      ...new Set(
        ((assignmentsRes.data ?? []) as { agent_id: string }[])
          .map((a) => a.agent_id)
          .filter(Boolean)
      ),
    ];
    const agentNames = await resolveUserDisplayNames(admin, assignmentAgentIds);
    const agents = assignmentAgentIds
      .map((id) => ({ id, name: agentNames[id] ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const enriched = await enrichLeadsWithCreatorNames(
      admin,
      rawLeads as (Record<string, unknown> & {
        campaign_id?: string;
        assigned_agent_id?: string;
        created_by?: string;
      })[],
      orgId
    );

    const leads = enriched.map((row) => {
      const meta = row.campaign_id ? campaignMeta[row.campaign_id as string] : undefined;
      return {
        ...row,
        campaign_name: meta?.name ?? "—",
        lead_type: resolveLeadTypeForExport(
          row.lead_type as string | null | undefined,
          meta?.lead_type
        ),
        assigned_agent_name: row.assigned_agent_name ?? "—",
        created_by_name: row.created_by_name ?? "—",
        qa_status: (row.qa_status as string | null) ?? null,
        disqualification_reasons: (row.disqualification_reasons as string | null) ?? null,
        disqualification_reason: (row.disqualification_reason as string | null) ?? null,
        rectified_reason: (row.rectified_reason as string | null) ?? null,
      };
    });

    if (exportAll) {
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(roleNames),
        category: "exports",
        eventType: "lead_export",
        description: `Exported ${total.toLocaleString()} leads (MIS leads list)`,
        targetType: "export",
        targetLabel: "mis_leads",
        metadata: {
          row_count: total,
          search: searchRaw || null,
          agent_ids: agentIds.length ? agentIds : null,
          date_from: dateFrom ?? null,
          date_to: dateTo ?? null,
        },
        request,
      });
    }

    return NextResponse.json({
      leads,
      pagination: buildPaginationMeta(
        exportAll ? 1 : page,
        exportAll ? Math.max(total, 1) : limit,
        total
      ),
      agents,
    });
  } catch (error) {
    console.error("MIS leads error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
