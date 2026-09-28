import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  MAX_CLIENT_LOGOS,
  normalizeClientLogoUrls,
  primaryClientLogoUrl,
} from "@/lib/admin/client-logos";

export const dynamic = "force-dynamic";

const LOGO_BUCKET = "client-logos";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

type ClientLogoRow = {
  id: string;
  organization_id: string;
  logo_url: string | null;
  logo_urls: string[] | null;
  company_name: string;
};

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const isAdmin = (roleRows ?? []).some(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() === "admin"
  );
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
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

  return { user, orgId };
}

async function getClientInOrg(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string,
  clientId: string
): Promise<ClientLogoRow | null> {
  // Prefer logo_urls; fall back to legacy select if column not yet migrated.
  const withUrls = (await admin
    .from("clients")
    .select("id, organization_id, logo_url, logo_urls, company_name")
    .eq("id", clientId)
    .single()) as unknown as {
    data: ClientLogoRow | null;
    error: { message: string } | null;
  };

  if (!withUrls.error && withUrls.data) {
    if (withUrls.data.organization_id !== orgId) return null;
    return withUrls.data;
  }

  const legacy = (await admin
    .from("clients")
    .select("id, organization_id, logo_url, company_name")
    .eq("id", clientId)
    .single()) as unknown as {
    data: Omit<ClientLogoRow, "logo_urls"> | null;
    error: { message: string } | null;
  };

  if (legacy.error || !legacy.data) return null;
  if (legacy.data.organization_id !== orgId) return null;
  return { ...legacy.data, logo_urls: null };
}

async function persistLogoUrls(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  clientId: string,
  urls: string[]
): Promise<{ error: string | null }> {
  const primary = primaryClientLogoUrl(urls);
  const withUrls = await admin
    .from("clients")
    .update({ logo_urls: urls, logo_url: primary } as never)
    .eq("id", clientId);

  if (!withUrls.error) return { error: null };

  // Deploy-order fallback: column missing → keep single logo_url only.
  if (/logo_urls/i.test(withUrls.error.message)) {
    const legacy = await admin
      .from("clients")
      .update({ logo_url: primary } as never)
      .eq("id", clientId);
    return { error: legacy.error?.message ?? null };
  }

  return { error: withUrls.error.message };
}

function logosResponse(client: ClientLogoRow) {
  const logo_urls = normalizeClientLogoUrls(client);
  return {
    logo_urls,
    logo_url: primaryClientLogoUrl(logo_urls),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if ("error" in auth) return auth.error;

    const { id: clientId } = await params;
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const client = await getClientInOrg(admin, auth.orgId, clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(logosResponse(client));
  } catch (err) {
    console.error("GET client logo error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if ("error" in auth) return auth.error;

    const { id: clientId } = await params;
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const client = await getClientInOrg(admin, auth.orgId, clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const existing = normalizeClientLogoUrls(client);
    if (existing.length >= MAX_CLIENT_LOGOS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_CLIENT_LOGOS} logos allowed per client` },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Valid image file required" }, { status: 400 });
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "Image must be 2MB or smaller" }, { status: 400 });
    }

    const ext =
      (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${auth.orgId}/${clientId}/logo-${Date.now()}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await admin.storage.from(LOGO_BUCKET).upload(path, arrayBuffer, {
      upsert: false,
      contentType: file.type,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from(LOGO_BUCKET).getPublicUrl(path);
    const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    const nextUrls = [...existing, logoUrl];

    const { error: updateError } = await persistLogoUrls(admin, clientId, nextUrls);
    if (updateError) {
      return NextResponse.json({ error: updateError }, { status: 500 });
    }

    return NextResponse.json({
      logo_urls: nextUrls,
      logo_url: primaryClientLogoUrl(nextUrls),
    });
  } catch (err) {
    console.error("POST client logo error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const auth = await requireAdmin(supabase);
    if ("error" in auth) return auth.error;

    const { id: clientId } = await params;
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const client = await getClientInOrg(admin, auth.orgId, clientId);
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as { url?: string; index?: number };
    const existing = normalizeClientLogoUrls(client);

    let removeIndex = -1;
    if (typeof body.index === "number" && Number.isInteger(body.index)) {
      removeIndex = body.index;
    } else if (typeof body.url === "string" && body.url.trim()) {
      const target = body.url.trim();
      const targetBare = target.split("?")[0] ?? target;
      removeIndex = existing.findIndex((u) => {
        const bare = u.split("?")[0] ?? u;
        return u === target || bare === targetBare;
      });
    }

    if (removeIndex < 0 || removeIndex >= existing.length) {
      return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    }

    const removed = existing[removeIndex];
    const nextUrls = existing.filter((_, i) => i !== removeIndex);

    const { error: updateError } = await persistLogoUrls(admin, clientId, nextUrls);
    if (updateError) {
      return NextResponse.json({ error: updateError }, { status: 500 });
    }

    // Best-effort storage cleanup (public URL path after bucket prefix).
    try {
      const bare = removed.split("?")[0] ?? removed;
      const marker = `/${LOGO_BUCKET}/`;
      const idx = bare.indexOf(marker);
      if (idx >= 0) {
        const storagePath = decodeURIComponent(bare.slice(idx + marker.length));
        if (storagePath.startsWith(`${auth.orgId}/${clientId}/`)) {
          await admin.storage.from(LOGO_BUCKET).remove([storagePath]);
        }
      }
    } catch {
      // ignore storage cleanup failures
    }

    return NextResponse.json({
      logo_urls: nextUrls,
      logo_url: primaryClientLogoUrl(nextUrls),
    });
  } catch (err) {
    console.error("DELETE client logo error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
