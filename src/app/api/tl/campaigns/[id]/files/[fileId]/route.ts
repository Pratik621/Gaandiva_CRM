import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    const { id: campaignId, fileId } = await params;
    if (!campaignId || !fileId) {
      return NextResponse.json({ error: "Campaign ID and file ID required" }, { status: 400 });
    }

    const { data: row, error: fetchError } = await supabase
      .from("campaign_files")
      .select("id, file_name, file_path, campaign_id, organization_id")
      .eq("id", fileId)
      .eq("campaign_id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const fileRow = row as { file_name: string; file_path: string };
    const path = fileRow.file_path;
    await supabase.storage.from("campaign-files").remove([path]);

    const { error: deleteError } = await supabase
      .from("campaign_files")
      .delete()
      .eq("id", fileId)
      .eq("organization_id", orgId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { data: campMeta } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .maybeSingle();
    const campaignName =
      (campMeta as { name: string | null } | null)?.name?.trim() || "campaign";

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_file_deleted",
      description: `Deleted file "${fileRow.file_name}" from campaign "${campaignName}"`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: campaignName,
      metadata: {
        file_id: fileId,
        file_name: fileRow.file_name,
        file_path: path,
        source: "tl_campaign_files",
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete campaign file error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
