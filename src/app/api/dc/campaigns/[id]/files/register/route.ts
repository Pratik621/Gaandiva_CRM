import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function verifyDC(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: roles } = await supabase.from("roles").select("id, name").eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles").select("role_id").eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const isDC = await verifyDC(supabase, user.id, orgId);
    if (!isDC) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    const { id: campaignId } = await params;
    const { data: campaign } = await admin
      .from("campaigns").select("id").eq("id", campaignId).eq("organization_id", orgId).single();
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const body = await request.json();
    const files = Array.isArray(body?.files) ? body.files : [];
    if (files.length === 0) return NextResponse.json({ error: "No files to register" }, { status: 400 });

    const uploaded: { id: string; file_name: string }[] = [];
    const errors: string[] = [];

    for (const f of files as { path: string; fileName: string; fileSize: number; mimeType: string }[]) {
      if (!f.path || !f.fileName) { errors.push("Missing path or fileName"); continue; }
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
      if (insertError) { errors.push(`${f.fileName}: ${insertError.message}`); continue; }
      if (row) uploaded.push(row as { id: string; file_name: string });
    }

    return NextResponse.json({ uploaded, errors: errors.length ? errors : undefined });
  } catch (err) {
    console.error("DC campaign files register error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
