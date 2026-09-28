import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Admin-only: link a WhatsApp number to a lead.
 * Agents never receive wa_number in any API response.
 *
 * POST { "leadId": "<leads.uuid>", "waNumber": "919876543210" }
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

    const payload = (await request.json()) as { leadId?: string; waNumber?: string };
    const leadId = payload.leadId?.trim();
    const waNumber = payload.waNumber?.replace(/\D/g, "");
    if (!leadId || !waNumber || waNumber.length < 10) {
      return NextResponse.json({ error: "leadId and valid waNumber are required" }, { status: 400 });
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

    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", leadId)
      .eq("organization_id", orgId)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found in your organization" }, { status: 404 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Admin client not configured" }, { status: 503 });
    }

    const { error: upsertErr } = await admin.from("lead_contacts").upsert(
      { lead_id: leadId, wa_number: waNumber } as never,
      { onConflict: "lead_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, leadId, linked: true });
  } catch (e) {
    console.error("POST lead-contacts:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
