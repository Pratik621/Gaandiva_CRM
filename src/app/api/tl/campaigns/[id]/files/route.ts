import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_CAMPAIGN_FILE_BYTES, MAX_CAMPAIGN_FILE_SIZE_MB } from "@/lib/campaign-file-upload-limits";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

const BUCKET = "campaign-files";
const ALLOWED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/octet-stream", // fallback for other docs
];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

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
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, name, organization_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const campaignName = (campaign as { name: string }).name;

    const formData = await request.formData();
    const uploadedFiles: { id: string; file_name: string }[] = [];
    const errors: string[] = [];

    for (const [key, value] of formData.entries()) {
      if (key !== "files" && key !== "file") continue;
      const file = value as File;
      if (!file?.name || typeof file.size !== "number") continue;
      if (file.size > MAX_CAMPAIGN_FILE_BYTES) {
        errors.push(`${file.name}: file too large (max ${MAX_CAMPAIGN_FILE_SIZE_MB}MB)`);
        continue;
      }
      const mime = file.type || "application/octet-stream";
      const allowed = ALLOWED_TYPES.includes(mime) || mime.startsWith("image/") || mime.startsWith("application/") || mime.startsWith("text/");
      if (!allowed) {
        errors.push(`${file.name}: type not allowed`);
        continue;
      }

      const safeName = sanitizeFileName(file.name);
      const path = `${orgId}/${campaignId}/${crypto.randomUUID()}_${safeName}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        errors.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      const { data: row, error: insertError } = await supabase
        .from("campaign_files")
        .insert({
          campaign_id: campaignId,
          organization_id: orgId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: user.id,
        } as never)
        .select("id, file_name")
        .single();

      if (insertError) {
        errors.push(`${file.name}: ${insertError.message}`);
        continue;
      }
      if (row) uploadedFiles.push(row as { id: string; file_name: string });
    }

    if (uploadedFiles.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join("; "), uploaded: [] }, { status: 400 });
    }

    if (uploadedFiles.length > 0) {
      const roleNames = await fetchUserRoleNames(supabase, user.id);
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(roleNames),
        category: "campaigns",
        eventType: "campaign_file_uploaded",
        description: `Uploaded ${uploadedFiles.length} file${uploadedFiles.length === 1 ? "" : "s"} to campaign "${campaignName}"`,
        targetType: "campaign",
        targetId: campaignId,
        targetLabel: campaignName,
        metadata: {
          file_count: uploadedFiles.length,
          file_names: uploadedFiles.map((f) => f.file_name),
          source: "tl_campaign_files",
        },
        request,
      });
    }

    return NextResponse.json({
      uploaded: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Upload campaign files error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
