import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchSalesLeadIfAccessible } from "@/lib/sales/canAccessSalesLead";

export const dynamic = "force-dynamic";

const BUCKET = "sales-lead-attachments";
const MAX_BYTES = 15 * 1024 * 1024;

async function getCtx() {
  const supabase = await createClient();
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

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const can =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");
  if (!can) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId, roleNames };
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { orgId, user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const lead = await fetchSalesLeadIfAccessible(admin, orgId, params.id, {
      userId: user.id,
      isManagerOrAdmin,
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: rows, error } = await admin
      .from("sales_lead_attachments")
      .select("id, file_name, storage_path, file_size, mime_type, uploaded_by, created_at")
      .eq("organization_id", orgId)
      .eq("sales_lead_id", params.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = (rows ?? []) as Record<string, unknown>[];
    const uploaderIds = Array.from(
      new Set(list.map((r) => r.uploaded_by).filter(Boolean) as string[])
    );
    const userNames: Record<string, string> = {};
    if (uploaderIds.length > 0) {
      const { data: users } = await admin
        .from("users")
        .select("id, full_name, email")
        .in("id", uploaderIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          userNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const withUrls = await Promise.all(
      list.map(async (r) => {
        let url: string | null = null;
        try {
          const { data: signed } = await admin.storage
            .from(BUCKET)
            .createSignedUrl(r.storage_path as string, 3600);
          url = signed?.signedUrl ?? null;
        } catch {
          url = null;
        }
        return {
          id: r.id as string,
          file_name: r.file_name as string,
          file_size: r.file_size as number | null,
          mime_type: (r.mime_type as string | null) ?? null,
          uploaded_by_name: r.uploaded_by ? userNames[r.uploaded_by as string] ?? "—" : null,
          created_at: r.created_at as string,
          url,
        };
      })
    );

    return NextResponse.json({ attachments: withUrls });
  } catch (err) {
    console.error("Lead attachments GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { orgId, user, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const isManagerOrAdmin =
      roleNames.includes("sales_manager") || roleNames.includes("admin");

    const lead = await fetchSalesLeadIfAccessible(admin, orgId, params.id, {
      userId: user.id,
      isManagerOrAdmin,
    });
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "file field required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
    const objectPath = `${orgId}/${params.id}/${Date.now()}_${safeName}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage.from(BUCKET).upload(objectPath, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

    if (upErr) {
      return NextResponse.json(
        { error: upErr.message || "Upload failed. Create storage bucket sales-lead-attachments in Supabase." },
        { status: 500 }
      );
    }

    const { data: row, error: insErr } = await admin
      .from("sales_lead_attachments")
      .insert({
        organization_id: orgId,
        sales_lead_id: params.id,
        file_name: file.name,
        storage_path: objectPath,
        file_size: file.size,
        mime_type: file.type || null,
        uploaded_by: user.id,
      } as never)
      .select("id")
      .single();

    if (insErr) {
      await admin.storage.from(BUCKET).remove([objectPath]);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: (row as { id: string }).id, success: true }, { status: 201 });
  } catch (err) {
    console.error("Lead attachments POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
