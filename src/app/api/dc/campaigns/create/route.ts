import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { generateCampaignId } from "@/lib/campaigns";
import { createNotification } from "@/lib/notifications";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { normalizeRevenueSize } from "@/lib/campaign/revenue-size";

export const dynamic = "force-dynamic";

const DC_CLIENT_NAME = "DC";
const MAX_RETRIES = 10;

async function verifyDC(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const isDC = await verifyDC(supabase, user.id, orgId);
    if (!isDC) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    const body = await request.json() as Record<string, unknown>;
    const {
      name,
      lead_type,
      start_date,
      end_date,
      status = "draft",
      cpl,
      total_allocation,
      employee_size,
      revenue_size,
      industry,
      geography,
      abm,
      seniority,
      job_function,
      creatives_url,
      weekly_call,
      weekly_report,
      additional_comments,
      assigned_team_leader_id,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Campaign Name is required" }, { status: 400 });
    }

    const validStatus = ["draft", "active", "paused", "completed"].includes(status as string)
      ? (status as string)
      : "draft";

    const leadTypeStr =
      Array.isArray(lead_type) && lead_type.length
        ? (lead_type as string[]).map((v) => String(v).trim()).filter(Boolean).join(", ")
        : typeof lead_type === "string"
        ? lead_type.trim() || null
        : null;

    const revenueBooked =
      cpl != null && total_allocation != null
        ? Number(cpl) * Number(total_allocation)
        : null;

    // Generate unique campaign_id
    let campaignId: string;
    let attempts = 0;
    do {
      campaignId = generateCampaignId({ clientName: DC_CLIENT_NAME, campaignName: name.trim() });
      const { data: existing } = await admin
        .from("campaigns")
        .select("id")
        .eq("campaign_id", campaignId)
        .maybeSingle();
      if (!existing) break;
      if (++attempts >= MAX_RETRIES) {
        return NextResponse.json({ error: "Could not generate a unique Campaign ID. Please try again." }, { status: 500 });
      }
    } while (true);

    const { data: campaign, error: insertError } = await admin
      .from("campaigns")
      .insert({
        organization_id: orgId,
        campaign_id: campaignId,
        name: name.trim(),
        client_name: DC_CLIENT_NAME,
        lead_type: leadTypeStr,
        start_date: start_date || null,
        end_date: end_date || null,
        status: validStatus,
        cpl: cpl != null ? Number(cpl) : null,
        revenue: revenueBooked,
        booked: revenueBooked,
        total_allocation: total_allocation != null ? Number(total_allocation) : null,
        employee_size: Array.isArray(employee_size) && employee_size.length > 0
          ? (employee_size as string[]).filter(Boolean).map((v) => String(v).trim())
          : null,
        revenue_size: normalizeRevenueSize(revenue_size),
        industry: typeof industry === "string" ? industry.trim() || null : null,
        geography: typeof geography === "string" ? geography.trim() || null : null,
        abm: abm === true || abm === "true" ? true : abm === false || abm === "false" ? false : null,
        seniority: typeof seniority === "string" ? seniority.trim() || null : null,
        job_function: typeof job_function === "string" ? job_function.trim() || null : null,
        creatives_url: Array.isArray(creatives_url) && creatives_url.length > 0
          ? (creatives_url as string[]).filter(Boolean).map((v) => String(v).trim()).filter(Boolean)
          : null,
        weekly_call: typeof weekly_call === "string" ? weekly_call.trim() || null : null,
        weekly_report: typeof weekly_report === "string" ? weekly_report.trim() || null : null,
        additional_comments: typeof additional_comments === "string" ? additional_comments.trim() || null : null,
        assigned_team_leader_id: assigned_team_leader_id || null,
        created_by: user.id,
      } as never)
      .select("id, campaign_id, campaign_code")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json({ error: "A campaign with this ID already exists. Please try again." }, { status: 409 });
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const row = campaign as { id: string; campaign_id: string; campaign_code: string | null } | null;
    const trimmedName = name.trim();

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_created",
      description: `Created campaign "${trimmedName}"`,
      targetType: "campaign",
      targetId: row?.id ?? null,
      targetLabel: trimmedName,
      metadata: {
        campaign_display_id: row?.campaign_id ?? null,
        status: validStatus,
        client_name: DC_CLIENT_NAME,
        source: "dc_campaigns",
      },
      request,
    });

    if (assigned_team_leader_id && assigned_team_leader_id !== user.id && row?.id) {
      void createNotification({
        title: "New Campaign Assigned",
        message: `Campaign "${trimmedName}" has been created and assigned to you.`,
        type: "campaign",
        sender_id: user.id,
        receiver_id: assigned_team_leader_id as string,
        reference_type: "campaign",
        reference_id: row.id,
        organization_id: orgId,
      });
    }

    return NextResponse.json({
      campaign_id: row?.id,
      campaign_display_id: row?.campaign_id,
      campaign_code: row?.campaign_code ?? null,
    });
  } catch (err) {
    console.error("DC create campaign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
