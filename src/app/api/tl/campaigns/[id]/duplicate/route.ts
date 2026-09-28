import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrgWideCampaignAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { duplicateCampaign } from "@/lib/campaign/duplicate-campaign";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

export async function POST(
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!hasOrgWideCampaignAccess(roleNames)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id: sourceCampaignId } = await params;
    if (!sourceCampaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Campaign name is required" }, { status: 400 });
    }

    const result = await duplicateCampaign({
      supabase,
      orgId,
      sourceCampaignId,
      newName: name,
      userId: user.id,
    });

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_duplicated",
      description: `Duplicated campaign as "${name}"`,
      targetType: "campaign",
      targetId: result.id,
      targetLabel: name,
      metadata: {
        source_campaign_id: sourceCampaignId,
        files_copied: result.filesCopied,
        file_error_count: result.fileErrors.length,
      },
      request,
    });

    return NextResponse.json({
      campaign_id: result.id,
      campaign_display_id: result.campaign_id,
      campaign_code: result.campaign_code,
      files_copied: result.filesCopied,
      file_errors: result.fileErrors.length ? result.fileErrors : undefined,
    });
  } catch (err) {
    console.error("Duplicate campaign error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message === "Campaign not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
