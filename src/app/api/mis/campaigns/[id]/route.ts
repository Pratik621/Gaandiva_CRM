import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  enrichCampaignAllocationFields,
  MIS_DELIVERED_ACHIEVED_OPTIONS,
} from "@/lib/campaign-allocation";
import { aggregateTlLeadCountsByCampaign } from "@/lib/tl/dashboard-leads";
import {
  fetchAllMisCampaignScoredLeads,
  fetchMisCampaignScoredLeadsPage,
  type MisCampaignLeadRow,
} from "@/lib/mis/campaign-leads";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .select(`
        id, campaign_id, campaign_code, name, client_name, description, industry, geography, target_designation, lead_type, status,
        start_date, end_date, created_at, cpl, revenue, booked, total_allocation, post_qa, achieved, pending_allocation,
        weekly_call, weekly_report, additional_comments, assigned_team_leader_id,
        employee_size, revenue_size, abm, seniority, job_function, creatives_url, campaign_questions
      `)
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const camp = campaign as { assigned_team_leader_id?: string | null; [k: string]: unknown };
    let assigned_team_leader_name: string | null = null;
    if (camp.assigned_team_leader_id) {
      const { data: tlUser } = await admin
        .from("users")
        .select("full_name, email")
        .eq("id", camp.assigned_team_leader_id)
        .single();
      const u = tlUser as { full_name: string | null; email: string | null } | null;
      assigned_team_leader_name = u ? (u.full_name || u.email || null) : null;
    }
    const campaignWithTlName = { ...(campaign as Record<string, unknown>), assigned_team_leader_name };

    type FileRow = {
      id: string;
      file_name: string;
      file_path: string;
      file_size: number | null;
      mime_type: string | null;
      created_at: string;
    };

    const { data: fileRows, error: filesError } = await admin
      .from("campaign_files")
      .select("id, file_name, file_path, file_size, mime_type, created_at")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (filesError) {
      console.error("MIS campaign files fetch error:", filesError.message);
    }

    const filesWithUrls = await Promise.all(
      ((fileRows ?? []) as FileRow[]).map(async (f) => {
        const { data: signed } = await admin.storage
          .from("campaign-files")
          .createSignedUrl(f.file_path, 3600);
        return {
          id: f.id,
          file_name: f.file_name,
          file_path: f.file_path,
          file_size: f.file_size,
          mime_type: f.mime_type,
          created_at: f.created_at,
          download_url: signed?.signedUrl ?? null,
        };
      })
    );

    const exportAll = new URL(request.url).searchParams.get("export") === "all";
    let leadsList: MisCampaignLeadRow[] = [];
    let leadsTotal = 0;
    let leadsPage = 1;
    let leadsLimit = 10;

    if (exportAll) {
      const all = await fetchAllMisCampaignScoredLeads(admin, campaignId);
      leadsList = all.rows;
      leadsTotal = all.total;
      leadsLimit = Math.max(leadsTotal, 1);
    } else {
      const parsed = parseListPagination(new URL(request.url).searchParams);
      leadsPage = parsed.page;
      leadsLimit = parsed.limit;
      const page = await fetchMisCampaignScoredLeadsPage(
        admin,
        campaignId,
        parsed.offset,
        parsed.limit
      );
      leadsList = page.rows;
      leadsTotal = page.total;
    }

    // Voice recordings load lazily via POST /api/leads/voice-recordings.
    const leadsWithRecordings = await enrichLeadsWithCreatorNames(admin ?? supabase, leadsList, orgId);

    const leadCounts = await aggregateTlLeadCountsByCampaign(admin, orgId, [campaignId]);
    const metrics = leadCounts[campaignId] ?? { total: 0, qualified: 0, disqualified: 0, delivered: 0 };
    const campaignWithAllocation = enrichCampaignAllocationFields(
      campaignWithTlName,
      metrics,
      MIS_DELIVERED_ACHIEVED_OPTIONS
    );

    if (exportAll) {
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(roleNames),
        category: "exports",
        eventType: "lead_export",
        description: `Exported ${leadsTotal.toLocaleString()} scored leads (MIS campaign detail)`,
        targetType: "campaign",
        targetId: campaignId,
        targetLabel: String(camp.name ?? campaignId),
        metadata: {
          row_count: leadsTotal,
          source: "mis_campaign_detail",
        },
        request,
      });
    }

    return NextResponse.json({
      campaign: campaignWithAllocation,
      leads: leadsWithRecordings,
      leads_pagination: buildPaginationMeta(leadsPage, leadsLimit, leadsTotal),
      files: filesWithUrls,
    });
  } catch (err) {
    console.error("MIS campaign detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
