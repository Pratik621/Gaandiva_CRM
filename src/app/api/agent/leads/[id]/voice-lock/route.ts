import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { getLeadForLeadAssetApi } from "@/lib/lead-api-access";
import {
  countLeadAssets,
  deleteLeadAssetByPath,
  insertLeadAsset,
  listVoiceRecordingsForLeads,
} from "@/lib/lead-assets";
import { MAX_VOICE_RECORDINGS_PER_LEAD, VOICE_BUCKET } from "@/lib/voice-recordings";

export const dynamic = "force-dynamic";

const MAX_RECORDINGS_PER_LEAD = MAX_VOICE_RECORDINGS_PER_LEAD;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
];

type LeadRecord = {
  id: string;
  campaign_id: string;
  organization_id: string;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

async function getAuthContext() {
  const supabase = await createClient();
  const admin = getAdminClientSafe();

  if (!admin) {
    return {
      error: NextResponse.json(
        { error: ADMIN_NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      ),
    };
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  return { supabase, admin, userId: user.id, orgId };
}

async function listVoiceForLead(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string,
  lead: LeadRecord
) {
  const map = await listVoiceRecordingsForLeads(admin, admin, orgId, [lead]);
  return map[lead.id] ?? [];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return auth.error;
    const { supabase, admin, orgId, userId } = auth;

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const leadResult = await getLeadForLeadAssetApi({
      supabase,
      admin,
      orgId,
      userId,
      leadId,
    });
    if ("error" in leadResult) return leadResult.error;
    const { lead } = leadResult;

    const recordings = await listVoiceForLead(admin, orgId, lead);
    return NextResponse.json({ recordings });
  } catch (err) {
    console.error("Voice Log GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return auth.error;
    const { supabase, admin, orgId, userId } = auth;

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const leadResult = await getLeadForLeadAssetApi({
      supabase,
      admin,
      orgId,
      userId,
      leadId,
    });
    if ("error" in leadResult) return leadResult.error;
    const { lead } = leadResult;

    const existingCount = await countLeadAssets(admin, orgId, lead.id, "voice");
    if (existingCount >= MAX_RECORDINGS_PER_LEAD) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_RECORDINGS_PER_LEAD} recordings reached for this lead` },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file =
      (formData.get("file") as File | null) ||
      (formData.get("files") as File | null);

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (typeof file.size !== "number" || file.size <= 0) {
      return NextResponse.json({ error: "Invalid file" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20MB." },
        { status: 400 }
      );
    }

    const mime = file.type || "application/octet-stream";
    const isAudio =
      ALLOWED_AUDIO_TYPES.includes(mime) || mime.startsWith("audio/");
    if (!isAudio) {
      return NextResponse.json(
        { error: "Only audio files are allowed for Voice Log" },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(file.name || "recording");
    const objectPath = `${orgId}/${lead.campaign_id}/${lead.id}/${crypto.randomUUID()}_${safeName}`;

    const { error: uploadError } = await admin.storage
      .from(VOICE_BUCKET)
      .upload(objectPath, file, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message ?? "Failed to upload recording" },
        { status: 500 }
      );
    }

    await insertLeadAsset(admin, {
      organization_id: orgId,
      campaign_id: lead.campaign_id,
      lead_id: lead.id,
      asset_type: "voice",
      file_name: safeName,
      file_path: objectPath,
      file_size: file.size,
      mime_type: mime,
      uploaded_by: userId,
    });

    const recordings = await listVoiceForLead(admin, orgId, lead);
    return NextResponse.json({ recordings });
  } catch (err) {
    console.error("Voice Log POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthContext();
    if ("error" in auth) return auth.error;
    const { supabase, admin, orgId, userId } = auth;

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const leadResult = await getLeadForLeadAssetApi({
      supabase,
      admin,
      orgId,
      userId,
      leadId,
    });
    if ("error" in leadResult) return leadResult.error;
    const { lead } = leadResult;

    const body = await request.json().catch(() => null);
    const path = body?.path as string | undefined;

    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "Recording path is required" }, { status: 400 });
    }

    const expectedPrefix = `${orgId}/${lead.campaign_id}/${lead.id}/`;
    if (!path.startsWith(expectedPrefix) || path.includes("/lho/")) {
      return NextResponse.json({ error: "Invalid recording path" }, { status: 400 });
    }

    const { error: removeError } = await admin.storage
      .from(VOICE_BUCKET)
      .remove([path]);

    if (removeError) {
      return NextResponse.json(
        { error: removeError.message ?? "Failed to delete recording" },
        { status: 500 }
      );
    }

    await deleteLeadAssetByPath(admin, orgId, path);

    const recordings = await listVoiceForLead(admin, orgId, lead);
    return NextResponse.json({ recordings });
  } catch (err) {
    console.error("Voice Log DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
