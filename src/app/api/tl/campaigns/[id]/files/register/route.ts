import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    const { data: campaign } = await supabase
      .from("campaigns").select("id, name")
      .eq("id", campaignId).eq("organization_id", orgId).single();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const campaignName = (campaign as { name: string }).name;

    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files to register" }, { status: 400 });
    }

    const uploaded: { id: string; file_name: string }[] = [];
    const errors: string[] = [];

    for (const f of files as { path: string; fileName: string; fileSize: number; mimeType: string }[]) {
      if (!f.path || !f.fileName) {
        errors.push(`Missing path or fileName`);
        continue;
      }
      const { data: row, error: insertError } = await supabase
        .from("campaign_files")
        .insert({
          campaign_id: campaignId,
          organization_id: orgId,
          file_name: f.fileName,
          file_path: f.path,
          file_size: f.fileSize ?? 0,
          mime_type: f.mimeType || null,
          uploaded_by: user.id,
        } as never)
        .select("id, file_name")
        .single();

      if (insertError) {
        errors.push(`${f.fileName}: ${insertError.message}`);
        continue;
      }
      if (row) uploaded.push(row as { id: string; file_name: string });
    }

    if (uploaded.length > 0) {
      const roleNames = await fetchUserRoleNames(supabase, user.id);
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(roleNames),
        category: "campaigns",
        eventType: "campaign_file_uploaded",
        description: `Uploaded ${uploaded.length} file${uploaded.length === 1 ? "" : "s"} to campaign "${campaignName}"`,
        targetType: "campaign",
        targetId: campaignId,
        targetLabel: campaignName,
        metadata: {
          file_count: uploaded.length,
          file_names: uploaded.map((f) => f.file_name),
          source: "tl_campaign_files_register",
        },
        request,
      });
    }

    return NextResponse.json({
      uploaded,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("TL campaign files register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
