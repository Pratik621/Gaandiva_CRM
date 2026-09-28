import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Admin-only: link a WhatsApp number to a client.
 * Agents never receive wa_number in any API response.
 *
 * POST { "clientId": "<clients.uuid>", "waNumber": "919876543210" }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
      .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
      .filter(Boolean) as string[];

    const canManage =
      roleNames.includes("internal_admin") ||
      roleNames.includes("admin") ||
      roleNames.includes("internal_operator") ||
      roleNames.includes("sales_manager");

    if (!canManage) {
      return NextResponse.json({ error: "Forbidden — admin or sales manager only" }, { status: 403 });
    }

    const payload = (await request.json()) as { clientId?: string; waNumber?: string };
    const clientId = payload.clientId?.trim();
    const waNumber = payload.waNumber?.replace(/\D/g, "");
    if (!clientId || !waNumber || waNumber.length < 10) {
      return NextResponse.json({ error: "clientId and valid waNumber are required" }, { status: 400 });
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

    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .single();

    if (!client) {
      return NextResponse.json({ error: "Client not found in your organization" }, { status: 404 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Admin client not configured" }, { status: 503 });
    }

    const { error: upsertErr } = await admin.from("client_contacts").upsert(
      { client_id: clientId, wa_number: waNumber } as never,
      { onConflict: "client_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, clientId, linked: true });
  } catch (e) {
    console.error("POST client-contacts:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
