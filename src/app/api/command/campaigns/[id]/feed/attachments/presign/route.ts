import { NextResponse } from "next/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { FEED_BUCKET } from "@/lib/command/campaign-feed";
import { authorizeCampaignFeed } from "@/lib/command/campaign-feed-auth";

export const dynamic = "force-dynamic";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const auth = await authorizeCampaignFeed(campaignId);
    if (!auth.ok) return auth.response;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: {
      signedUrl: string;
      token: string;
      path: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    }[] = [];
    const errors: string[] = [];

    for (const f of files as { fileName: string; mimeType: string; fileSize: number }[]) {
      const safeName = sanitizeFileName(f.fileName || "file");
      const objectPath = `${auth.orgId}/${campaignId}/feed/${crypto.randomUUID()}_${safeName}`;
      const { data: signed, error: signErr } = await admin.storage
        .from(FEED_BUCKET)
        .createSignedUploadUrl(objectPath);
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
    console.error("POST campaign feed attachments presign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
