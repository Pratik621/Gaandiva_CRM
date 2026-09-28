import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { getLeadForLeadAssetApi } from "@/lib/lead-api-access";
import {
  countLeadAssets,
  deleteLeadAssetByPath,
  insertLeadAsset,
  listLhoFilesForLead,
} from "@/lib/lead-assets";

export const dynamic = "force-dynamic";

const LHO_BUCKET = "campaign-files";
const MAX_LHO_FILES_PER_LEAD = 4;
const MAX_LHO_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ALLOWED_LHO_TYPES = [
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
  "application/octet-stream",
];

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

    const files = await listLhoFilesForLead(admin, admin, orgId, lead);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("LHO GET error:", err);
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

    const existingCount = await countLeadAssets(admin, orgId, lead.id, "lho");
    if (existingCount >= MAX_LHO_FILES_PER_LEAD) {
      return NextResponse.json(
        { error: `Maximum of ${MAX_LHO_FILES_PER_LEAD} LHO files reached for this lead` },
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

    if (file.size > MAX_LHO_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 50MB." },
        { status: 400 }
      );
    }

    const mime = file.type || "application/octet-stream";
    const allowed =
      ALLOWED_LHO_TYPES.includes(mime) ||
      mime.startsWith("image/") ||
      mime.startsWith("application/") ||
      mime.startsWith("text/");
    if (!allowed) {
      return NextResponse.json(
        { error: "This file type is not allowed for LHO upload" },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(file.name || "lho");
    const objectPath = `${orgId}/${lead.campaign_id}/${lead.id}/lho/${crypto.randomUUID()}_${safeName}`;

    const { error: uploadError } = await admin.storage
      .from(LHO_BUCKET)
      .upload(objectPath, file, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message ?? "Failed to upload LHO file" },
        { status: 500 }
      );
    }

    await insertLeadAsset(admin, {
      organization_id: orgId,
      campaign_id: lead.campaign_id,
      lead_id: lead.id,
      asset_type: "lho",
      file_name: safeName,
      file_path: objectPath,
      file_size: file.size,
      mime_type: mime,
      uploaded_by: userId,
    });

    const files = await listLhoFilesForLead(admin, admin, orgId, lead);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("LHO POST error:", err);
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
      return NextResponse.json({ error: "File path is required" }, { status: 400 });
    }

    const expectedPrefix = `${orgId}/${lead.campaign_id}/${lead.id}/lho/`;
    if (!path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Invalid LHO file path" }, { status: 400 });
    }

    const { error: removeError } = await admin.storage
      .from(LHO_BUCKET)
      .remove([path]);

    if (removeError) {
      return NextResponse.json(
        { error: removeError.message ?? "Failed to delete LHO file" },
        { status: 500 }
      );
    }

    await deleteLeadAssetByPath(admin, orgId, path);

    const files = await listLhoFilesForLead(admin, admin, orgId, lead);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("LHO DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
