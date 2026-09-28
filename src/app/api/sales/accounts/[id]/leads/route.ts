import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getCtx() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };

  const { data: roleRows } = await supabase.from("user_roles").select("roles(name)").eq("user_id", user.id);
  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];
  const can = roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!can) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { user, orgId, roleNames };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx();
    if ("error" in ctx) return ctx.error;
    const { user, orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });

    const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");

    let q = admin
      .from("sales_leads")
      .select("id, lead_name, first_name, last_name, email, phone, job_title, status, lead_score, assigned_agent_id, created_at")
      .eq("organization_id", orgId)
      .eq("account_id", params.id)
      .order("created_at", { ascending: false });

    if (!isManagerOrAdmin) {
      q = q.or(`assigned_agent_id.eq.${user.id},created_by.eq.${user.id}`);
    }

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const leads = (rows ?? []) as Record<string, unknown>[];
    const agentIds = Array.from(new Set(leads.map((l) => l.assigned_agent_id).filter(Boolean) as string[]));
    const names: Record<string, string> = {};
    if (agentIds.length > 0) {
      const { data: users } = await admin.from("users").select("id, full_name, email").in("id", agentIds);
      ((users ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        names[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const shaped = leads.map((l) => {
      const primaryName =
        (l.lead_name as string | null) ||
        [l.first_name, l.last_name].filter((p) => p && String(p).trim()).join(" ").trim() ||
        "Unnamed";
      return {
        id: l.id as string,
        lead_name: primaryName,
        email: (l.email as string | null) ?? null,
        phone: (l.phone as string | null) ?? null,
        job_title: (l.job_title as string | null) ?? null,
        status: l.status as string,
        lead_score: (l.lead_score as string | null) ?? null,
        assigned_to_name: l.assigned_agent_id ? names[l.assigned_agent_id as string] ?? null : null,
        created_at: l.created_at as string,
      };
    });

    return NextResponse.json({ leads: shaped });
  } catch (err) {
    console.error("Account leads GET:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
