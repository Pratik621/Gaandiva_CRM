import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { getLeadForLeadAssetApi } from "@/lib/lead-api-access";
import { countLeadAssets, insertLeadAsset } from "@/lib/lead-assets";
import { MAX_VOICE_RECORDINGS_PER_LEAD } from "@/lib/voice-recordings";

export const dynamic = "force-dynamic";

const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

/**
 * After a client completes a signed Storage upload, register the object in
 * lead_assets so listings do not depend on Storage.list.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

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

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const leadResult = await getLeadForLeadAssetApi({
      supabase,
      admin,
      orgId,
      userId: user.id,
      leadId,
    });
    if ("error" in leadResult) return leadResult.error;
    const lead = leadResult.lead;

    const body = await request.json().catch(() => null);
    const path = typeof body?.path === "string" ? body.path : "";
    const fileNameRaw = typeof body?.fileName === "string" ? body.fileName : "recording";
    const mimeType =
      typeof body?.mimeType === "string" ? body.mimeType : "audio/mpeg";
    const fileSize =
      typeof body?.fileSize === "number" && Number.isFinite(body.fileSize)
        ? body.fileSize
        : null;

    const expectedPrefix = `${orgId}/${lead.campaign_id}/${lead.id}/`;
    if (!path || !path.startsWith(expectedPrefix) || path.includes("/lho/")) {
      return NextResponse.json({ error: "Invalid recording path" }, { status: 400 });
    }

    const isAudio =
      ALLOWED_AUDIO_TYPES.includes(mimeType) || mimeType.startsWith("audio/");
    if (!isAudio) {
      return NextResponse.json({ error: "Only audio files are allowed" }, { status: 400 });
    }

    const { data: existingRow } = await admin
      .from("lead_assets")
      .select("id")
      .eq("organization_id", orgId)
      .eq("file_path", path)
      .maybeSingle();

    if (!existingRow) {
      const existingCount = await countLeadAssets(admin, orgId, lead.id, "voice");
      if (existingCount >= MAX_VOICE_RECORDINGS_PER_LEAD) {
        return NextResponse.json(
          { error: `Maximum of ${MAX_VOICE_RECORDINGS_PER_LEAD} recordings reached` },
          { status: 400 }
        );
      }
    }

    const fileNameFromPath = path.slice(expectedPrefix.length);
    const safeName = sanitizeFileName(fileNameRaw) || fileNameFromPath;
    await insertLeadAsset(admin, {
      organization_id: orgId,
      campaign_id: lead.campaign_id,
      lead_id: lead.id,
      asset_type: "voice",
      file_name: safeName,
      file_path: path,
      file_size: fileSize,
      mime_type: mimeType,
      uploaded_by: user.id,
    });

    return NextResponse.json({ ok: true, path });
  } catch (err) {
    console.error("Voice register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
