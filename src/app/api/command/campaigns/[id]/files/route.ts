import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, getProfile } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  applyClientViewerCampaignListScope,
} from "@/lib/command/client-viewer-scope";
import { MAX_CAMPAIGN_FILE_BYTES, MAX_CAMPAIGN_FILE_SIZE_MB } from "@/lib/campaign-file-upload-limits";

export const dynamic = "force-dynamic";

const BUCKET = "campaign-files";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

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

    const userRoles = await getRoleNames(supabase, user.id);
    const isCommand = hasCommandRole(userRoles);
    const isClientViewer = userRoles.includes("client_viewer");
    if (!isCommand && !isClientViewer) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const profile = await getProfile(supabase, user.id);
    const orgId = profile?.organization_id ?? "";
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    let campaignQuery = supabase
      .from("campaigns")
      .select("id, organization_id, client_id, created_by")
      .eq("id", campaignId)
      .eq("organization_id", orgId);

    if (isClientViewer) {
      const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
      campaignQuery = applyClientViewerCampaignListScope(campaignQuery, scope);
      campaignQuery = campaignQuery.eq("created_by", user.id);
    }

    const { data: campaign } = await campaignQuery.single();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json(
        { error: "Admin API not configured. Set SUPABASE_SERVICE_ROLE_KEY in deployment environment." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const uploaded: { id: string; file_name: string }[] = [];
    const errors: string[] = [];

    for (const [key, value] of formData.entries()) {
      if (key !== "files" && key !== "file") continue;
      const file = value as File;
      if (!file?.name || typeof file.size !== "number") continue;
      if (file.size > MAX_CAMPAIGN_FILE_BYTES) {
        errors.push(`${file.name}: file too large (max ${MAX_CAMPAIGN_FILE_SIZE_MB}MB)`);
        continue;
      }

      const safeName = sanitizeFileName(file.name);
      const path = `${orgId}/${campaignId}/${crypto.randomUUID()}_${safeName}`;

      const { error: uploadErr } = await admin.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadErr) {
        errors.push(`${file.name}: ${uploadErr.message}`);
        continue;
      }

      const { data: row, error: insertErr } = await admin
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

      if (insertErr) {
        errors.push(`${file.name}: ${insertErr.message}`);
        continue;
      }
      if (row) uploaded.push(row as { id: string; file_name: string });
    }

    if (uploaded.length === 0 && errors.length > 0) {
      return NextResponse.json({ error: errors.join("; "), uploaded: [] }, { status: 400 });
    }

    return NextResponse.json({ uploaded, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.error("Command campaign file upload error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

