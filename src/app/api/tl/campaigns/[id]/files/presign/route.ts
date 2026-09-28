import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

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
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: profile } = await supabase
      .from("users").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    const { data: campaign } = await supabase
      .from("campaigns").select("id")
      .eq("id", campaignId).eq("organization_id", orgId).single();
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { signedUrl: string; token: string; path: string; fileName: string; mimeType: string; fileSize: number }[] = [];
    const errors: string[] = [];

    for (const f of files as { fileName: string; mimeType: string; fileSize: number }[]) {
      const safeName = sanitizeFileName(f.fileName || "file");
      const objectPath = `${orgId}/${campaignId}/${crypto.randomUUID()}_${safeName}`;
      const { data: signed, error: signErr } = await admin.storage
        .from(BUCKET).createSignedUploadUrl(objectPath);
      if (signErr || !signed) {
        errors.push(`${f.fileName}: ${signErr?.message ?? "Failed to create upload URL"}`);
        continue;
      }
      results.push({
        signedUrl: signed.signedUrl,
        token: signed.token,
        path: objectPath,
        fileName: f.fileName,
        mimeType: f.mimeType || "application/octet-stream",
        fileSize: f.fileSize ?? 0,
      });
    }

    return NextResponse.json({ urls: results, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("TL campaign files presign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
