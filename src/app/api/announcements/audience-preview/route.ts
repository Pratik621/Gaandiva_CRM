import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { fetchPermissionRulesForSender, findSendRule } from "@/lib/announcements/permissions";
import { previewAudience } from "@/lib/announcements/audience";
import {
  ANNOUNCEMENT_TYPES,
  TARGET_MODES,
  type AnnouncementType,
  type TargetMode,
} from "@/lib/announcements/types";

export const dynamic = "force-dynamic";

/** "Will reach N people" preview for the create form. */
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

    const sp = request.nextUrl.searchParams;
    const mode = (sp.get("mode") ?? "") as TargetMode;
    const targetRole = sp.get("target_role")?.trim() ?? "";
    const type = (sp.get("type") ?? "note") as AnnouncementType;
    const campaignId = sp.get("campaign_id")?.trim() || null;
    const userIds = (sp.get("user_ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (
      !(TARGET_MODES as readonly string[]).includes(mode) ||
      !targetRole ||
      !(ANNOUNCEMENT_TYPES as readonly string[]).includes(type)
    ) {
      return NextResponse.json({ error: "Invalid preview params" }, { status: 400 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const rules = await fetchPermissionRulesForSender(admin, orgId, roleNames);
    const rule = findSendRule(rules, { type, targetRole });
    if (!rule) {
      return NextResponse.json({ error: "Not allowed for this target" }, { status: 403 });
    }

    const preview = await previewAudience(admin, orgId, { id: user.id }, rule, {
      mode,
      target_role: targetRole,
      campaign_id: campaignId,
      user_ids: userIds,
    });

    return NextResponse.json(preview);
  } catch (err) {
    console.error("Announcements audience preview error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
