import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { getLeadForLeadAssetApi } from "@/lib/lead-api-access";
import { countLeadAssets } from "@/lib/lead-assets";
import { MAX_VOICE_RECORDINGS_PER_LEAD, VOICE_BUCKET } from "@/lib/voice-recordings";

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
    const l = leadResult.lead;

    const existingCount = await countLeadAssets(admin, orgId, l.id, "voice");
    if (existingCount >= MAX_VOICE_RECORDINGS_PER_LEAD) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_VOICE_RECORDINGS_PER_LEAD} recordings reached` },
        { status: 400 }
      );
    }

    const body = await request.json();
    const fileName = typeof body?.fileName === "string" ? body.fileName : "recording";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "audio/mpeg";
    const isAudio = ALLOWED_AUDIO_TYPES.includes(mimeType) || mimeType.startsWith("audio/");
    if (!isAudio) {
      return NextResponse.json({ error: "Only audio files are allowed" }, { status: 400 });
    }

    const safeName = sanitizeFileName(fileName);
    const objectPath = `${orgId}/${l.campaign_id}/${l.id}/${crypto.randomUUID()}_${safeName}`;

    const { data: signed, error: signErr } = await admin.storage
      .from(VOICE_BUCKET)
      .createSignedUploadUrl(objectPath);

    if (signErr || !signed) {
      return NextResponse.json(
        { error: signErr?.message ?? "Failed to create upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      signedUrl: signed.signedUrl,
      token: signed.token,
      path: objectPath,
    });
  } catch (err) {
    console.error("Voice presign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
