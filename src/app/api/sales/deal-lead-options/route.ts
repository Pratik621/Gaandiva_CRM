import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { DEAL_ASSOCIATE_PREFIX_CONTACT, DEAL_ASSOCIATE_PREFIX_LEAD } from "@/lib/sales/dealAssociate";

export const dynamic = "force-dynamic";

async function getUserAndOrg() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
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

  const canAccess =
    roleNames.includes("sales") || roleNames.includes("sales_manager") || roleNames.includes("admin");
  if (!canAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId, roleNames };
}

export async function GET() {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { user, orgId, roleNames } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    let query = admin
      .from("sales_leads")
      .select("id, lead_name, email, converted_contact_id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    const isManagerOrAdmin = roleNames.includes("sales_manager") || roleNames.includes("admin");
    if (!isManagerOrAdmin) {
      query = query.or(`assigned_agent_id.eq.${user!.id},created_by.eq.${user!.id}`);
    }

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const leads = (rows ?? []) as {
      id: string;
      lead_name: string | null;
      email: string | null;
      converted_contact_id: string | null;
    }[];

    const options: { value: string; label: string }[] = leads.map((l) => {
      const name = (l.lead_name ?? "").trim() || "Unnamed lead";
      const emailPart = (l.email ?? "").trim() || "—";
      const label = `${name} · ${emailPart}`;
      return { value: `${DEAL_ASSOCIATE_PREFIX_LEAD}${l.id}`, label };
    });

    /* CRM contacts not required as leads (e.g. imported) — same label pattern for search */
    let contactQuery = admin
      .from("contacts")
      .select("id, contact_name, email")
      .order("created_at", { ascending: false });

    if (!isManagerOrAdmin) {
      contactQuery = contactQuery.eq("owner_id", user!.id);
    }

    const { data: contactRows, error: cErr } = await contactQuery;
    if (!cErr && contactRows?.length) {
      const seen = new Set(options.map((o) => o.value));
      for (const c of contactRows as { id: string; contact_name: string | null; email: string | null }[]) {
        const v = `${DEAL_ASSOCIATE_PREFIX_CONTACT}${c.id}`;
        if (seen.has(v)) continue;
        const name = (c.contact_name ?? "").trim() || "Contact";
        const emailPart = (c.email ?? "").trim() || "—";
        options.push({ value: v, label: `${name} · ${emailPart}` });
        seen.add(v);
      }
    }

    return NextResponse.json({ options });
  } catch (err) {
    console.error("Sales deal-lead-options GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
