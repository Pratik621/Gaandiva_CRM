import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { loadOpsReportFilterOptions } from "@/lib/qatl/ops-performance-filters";
import { hasOperationsManagerAccess } from "@/lib/auth/tl-access";
import { isSeniorTeamLeaderRole } from "@/lib/auth/stl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

export const dynamic = "force-dynamic";

/**
 * Filter options for the STL Reports dashboard. OM/admin get the same
 * org-wide options as /api/qatl/reports/ops-performance/filters. A plain STL
 * only gets their own team leaders (and those TLs' agents) — never the full
 * org roster.
 */
export async function GET() {
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isOrgWide = hasOperationsManagerAccess(roleNames) || roleNames.includes("admin");
    const isStl = roleNames.some((n) => isSeniorTeamLeaderRole(n));
    if (!isOrgWide && !isStl) {
      return NextResponse.json({ error: "Forbidden: STL or Operations Manager role required" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const options = await loadOpsReportFilterOptions(admin, orgId);

    if (isOrgWide) {
      return NextResponse.json(options);
    }

    const { data: ownTlRows, error: ownTlErr } = await admin
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .eq("stl_id", user.id);

    if (ownTlErr) {
      return NextResponse.json({ error: ownTlErr.message }, { status: 500 });
    }

    const ownTlIds = new Set((ownTlRows ?? []).map((r) => (r as { id: string }).id));
    const team_leaders = options.team_leaders.filter((tl) => ownTlIds.has(tl.id));
    const agents = [
      ...new Map(
        team_leaders.flatMap((tl) => tl.agents).map((a) => [a.id, a])
      ).values(),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      ...options,
      team_leaders,
      agents,
    });
  } catch (err) {
    console.error("STL ops performance filter options error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
