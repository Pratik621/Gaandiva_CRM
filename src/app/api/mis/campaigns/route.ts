import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { resolveDateRangeParams } from "@/lib/date-range-tz";
import { loadMistlCampaignsForDateRange } from "@/lib/mistl-campaigns-data";

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
      return NextResponse.json({ error: "Forbidden: MIS TL or Admin role required" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const sp = request.nextUrl.searchParams;
    const range = resolveDateRangeParams(sp, "UTC");
    if ("error" in range) {
      return NextResponse.json({ error: range.error }, { status: 400 });
    }

    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const requestedLimit = Math.max(1, parseInt(sp.get("limit") ?? "10", 10) || 10);
    const includeLeads = sp.get("include_leads") === "1";
    const searchQuery = sp.get("q")?.trim() || undefined;
    const statusFilter = sp.get("status")?.trim() || undefined;
    const leadTypeFilter = sp.get("lead_type")?.trim() || undefined;
    const campaignIds = (sp.get("campaign_ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const maxLimit = campaignIds.length > 0 ? 500 : 100;
    const limit = Math.min(
      maxLimit,
      campaignIds.length > 0 ? Math.max(requestedLimit, campaignIds.length) : requestedLimit
    );

    const { campaigns, summary, lead_types, pagination } = await loadMistlCampaignsForDateRange(
      admin,
      orgId,
      range.startUtc,
      range.endUtc,
      {
        page,
        limit,
        includeLeads,
        campaignIds: campaignIds.length > 0 ? campaignIds : undefined,
        q: searchQuery,
        status: statusFilter,
        leadType: leadTypeFilter,
      }
    );

    return NextResponse.json({
      date_range: {
        start: range.startDate,
        end: range.endDate,
        single_day: range.startDate === range.endDate,
      },
      summary,
      lead_types,
      campaigns,
      pagination,
    });
  } catch (err) {
    console.error("MISTL campaigns list error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
