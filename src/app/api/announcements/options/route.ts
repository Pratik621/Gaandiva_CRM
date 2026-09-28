import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { normalizeRoleName } from "@/lib/auth/config";
import { fetchPermissionRulesForSender } from "@/lib/announcements/permissions";
import { resolveAudience } from "@/lib/announcements/audience";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";

export const dynamic = "force-dynamic";

const MAX_USER_OPTIONS = 500;

/**
 * Selector data for the create form: campaigns (group mode) and, when
 * target_role is given, the users the caller may target individually
 * (scope narrowing applied — a TL only sees their own team here).
 */
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

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const rules = await fetchPermissionRulesForSender(admin, orgId, roleNames);
    if (rules.length === 0) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hasOrgScope = rules.some((r) => r.scope === "org");
    const isTeamScopedTl = !hasOrgScope && rules.some((r) => r.scope === "team");

    // Campaign options: org-wide senders pick any campaign; team-scoped TLs
    // only their own (junction + legacy).
    let campaignsQuery = admin
      .from("campaigns")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name");

    if (isTeamScopedTl) {
      const { data: junction } = await admin
        .from("campaign_team_leader_assignments")
        .select("campaign_id")
        .eq("team_leader_id", user.id)
        .eq("organization_id", orgId)
        .eq("is_active", true);
      const junctionIds = [
        ...new Set(
          ((junction ?? []) as { campaign_id: string }[]).map((r) => r.campaign_id)
        ),
      ];
      if (junctionIds.length > 0) {
        const idList = junctionIds.map((id) => `"${id}"`).join(",");
        campaignsQuery = campaignsQuery.or(
          `assigned_team_leader_id.eq.${user.id},id.in.(${idList})`
        );
      } else {
        campaignsQuery = campaignsQuery.eq("assigned_team_leader_id", user.id);
      }
    }

    const { data: campaigns } = await campaignsQuery;

    // Individual-targeting user options for a specific target role.
    const targetRole = normalizeRoleName(request.nextUrl.searchParams.get("target_role"));
    let users: { id: string; name: string }[] = [];
    if (targetRole) {
      const rule = rules.find((r) => r.target_role === targetRole);
      if (rule) {
        const ids = (
          await resolveAudience(admin, orgId, { id: user.id }, rule, {
            mode: "role",
            target_role: targetRole,
          })
        ).slice(0, MAX_USER_OPTIONS);
        const names = await resolveUserDisplayNames(admin, ids);
        users = ids
          .map((id) => ({ id, name: names[id] ?? "Unknown" }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return NextResponse.json({
      campaigns: ((campaigns ?? []) as { id: string; name: string }[]).map((c) => ({
        id: c.id,
        name: c.name,
      })),
      users,
    });
  } catch (err) {
    console.error("Announcements options error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
