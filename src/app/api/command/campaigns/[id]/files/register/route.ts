import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, getProfile } from "@/lib/command/db";

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

    const userRoles = await getRoleNames(supabase, user.id);
    if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const profile = await getProfile(supabase, user.id);
    const orgId = profile?.organization_id ?? "";
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
      return NextResponse.json({ error: "No files to register" }, { status: 400 });
    }

    const uploaded: { id: string; file_name: string }[] = [];
    const errors: string[] = [];

    for (const f of files as { path: string; fileName: string; fileSize: number; mimeType: string }[]) {
      if (!f.path || !f.fileName) {
        errors.push("Missing path or fileName");
        continue;
      }
      const { data: row, error: insertError } = await admin
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

    return NextResponse.json({ uploaded, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("Command campaign files register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
