import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  enrichCampaignAllocationFields,
  MIS_DELIVERED_ACHIEVED_OPTIONS,
} from "@/lib/campaign-allocation";
import { aggregateTlLeadCountsByCampaign } from "@/lib/tl/dashboard-leads";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";

export const dynamic = "force-dynamic";

type SupabaseRowResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

type DcCampaignRow = Record<string, unknown>;
type DcFileRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};
type DcLeadRow = Record<string, unknown>;

async function verifyDC(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: roles } = await supabase.from("roles").select("id, name").eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles").select("role_id").eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const isDC = await verifyDC(supabase, user.id, orgId);
    if (!isDC) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    const { id: campaignId } = await params;

    const campaignSelect =
      "id, campaign_id, campaign_code, name, description, industry, geography, lead_type, status, start_date, end_date, total_allocation, post_qa, achieved, pending_allocation, additional_comments, employee_size, revenue_size, abm, seniority, job_function, creatives_url, cpl, revenue, booked, weekly_call, weekly_report, client_name";
    const leadsSelect =
      "id, campaign_id, organization_id, lead_id, name, first_name, last_name, salutation, email, phone, direct_number, company_name, company_number, job_title, job_level, job_function, department, industry, employee_size, address, address2, address_link, city, state, country, zip_code, status, qa_status, delivery_status, delivery_remark, delivered_at, delivered_by, lead_tagging, lead_disposition, followup_date, assigned_agent_id, created_by, creator_display_name, created_at, updated_at, scored, scored_timezone, appointment, appointment_timezone, revenue_range, revenue_link, contact_linkedin_url, company_linkedin_url, domain, phone_number_link, job_title_link, employee_size_link, actual_employee_size, company_website_link, industry_type_link, sic_code, sic_code_link, naics_code, naics_code_link, founded_years, founded_years_link, see_all_employees, ra_comment, special_comments, call_back, call_notes, primary_reason, secondary_reason, qa_comments, disqualification_reasons, disqualification_reason, rectified_reason, rectification_status, rectification_qa_name, rectification_date, cq1, cq2, cq3, cq4, cq5, extra_cq, audit_date, qa_name, qa_audited_by_id, qa_audited_at, asset_title, asset_title2, vv_status, email_status, ev_tool, tenurity, channel, notes";

    const [campaignResult, fileRowsResult, leadsResult] = (await Promise.all([
      admin
        .from("campaigns")
        .select(campaignSelect)
        .eq("id", campaignId)
        .eq("organization_id", orgId)
        .single(),
      admin
        .from("campaign_files")
        .select("id, file_name, file_path, file_size, mime_type, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      admin
        .from("leads")
        .select(leadsSelect)
        .eq("campaign_id", campaignId)
        .eq("lead_tagging", "Scored")
        .eq("delivery_status", "delivered")
        .order("created_at", { ascending: false }),
    ])) as [
      SupabaseRowResult<DcCampaignRow>,
      SupabaseRowResult<DcFileRow[]>,
      SupabaseRowResult<DcLeadRow[]>,
    ];

    if (campaignResult.error || !campaignResult.data) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaign = campaignResult.data;

    const filesWithUrls = await Promise.all(
      (fileRowsResult.data ?? []).map(async (f) => {
        const { data: signed } = await admin.storage.from("campaign-files").createSignedUrl(f.file_path, 3600);
        return { ...f, download_url: signed?.signedUrl ?? null };
      })
    );

    // Voice recordings load lazily via POST /api/leads/voice-recordings.
    const leads = await enrichLeadsWithCreatorNames(
      admin,
      (leadsResult.data ?? []) as Record<string, unknown>[],
      orgId
    );

    const leadCounts = await aggregateTlLeadCountsByCampaign(admin, orgId, [campaignId]);
    const metrics = leadCounts[campaignId] ?? { total: 0, qualified: 0, disqualified: 0, delivered: 0 };
    const enrichedCampaign = enrichCampaignAllocationFields(
      campaign,
      metrics,
      MIS_DELIVERED_ACHIEVED_OPTIONS
    );

    return NextResponse.json({ campaign: enrichedCampaign, files: filesWithUrls, leads });
  } catch (err) {
    console.error("DC campaign detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
