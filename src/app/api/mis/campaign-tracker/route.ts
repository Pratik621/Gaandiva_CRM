import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  loadCampaignTrackerData,
  parseCampaignTrackerFilters,
} from "@/lib/campaign-tracker/query";

export const dynamic = "force-dynamic";

async function assertMisAccess(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", userId);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[]).map((r) =>
    r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_")
  );
  const canView = roleNames.includes("mis") || roleNames.includes("admin");
  if (!canView) {
    return {
      error: NextResponse.json(
        { error: "Forbidden: MIS or Admin role required" },
        { status: 403 }
      ),
    };
  }

  const admin = getAdminClientSafe();
  if (!admin) {
    return { error: NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 }) };
  }

  return { orgId, admin };
}

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

    const access = await assertMisAccess(supabase, user.id);
    if ("error" in access && access.error) return access.error;
    const { orgId, admin } = access as {
      orgId: string;
      admin: NonNullable<ReturnType<typeof getAdminClientSafe>>;
    };

    const filters = parseCampaignTrackerFilters(request.nextUrl.searchParams);
    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams);

    const result = await loadCampaignTrackerData(admin, orgId, filters, { offset, limit });

    return NextResponse.json({
      clients: result.clients,
      campaigns: result.campaigns,
      summary: result.summary,
      filterOptions: result.filterOptions,
      date_range: result.date_range,
      pagination: buildPaginationMeta(page, limit, result.total_client_groups),
    });
  } catch (err) {
    console.error("MIS campaign tracker error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
