import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { ensureClientWhatsAppLinked } from "@/lib/chat/client-whatsapp";

export const dynamic = "force-dynamic";

async function getUserContext() {
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

  if (!roleNames.includes("sales_manager")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId };
}

function str(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s === "" ? null : s;
}

function num(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function bool(val: unknown): boolean | null {
  if (val == null) return null;
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    if (val === "true" || val === "1" || val === "yes") return true;
    if (val === "false" || val === "0" || val === "no") return false;
  }
  return null;
}

function date(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string") return val;
  if (typeof (val as { format?: (f: string) => string })?.format === "function") {
    return (val as { format: (f: string) => string }).format("YYYY-MM-DD");
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserContext();
    if ("error" in ctx) return ctx.error;
    const { orgId } = ctx;

    const clientId = params.id;
    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const body = await request.json();

    const company_name = str(body.company_name);
    if (!company_name) {
      return NextResponse.json({ error: "Client name is required" }, { status: 400 });
    }

    const contact_person = str(body.contact_person);
    if (!contact_person) {
      return NextResponse.json({ error: "Contact person is required" }, { status: 400 });
    }

    const contact_full_name = str(body.contact_full_name);
    if (!contact_full_name) {
      return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    }

    const country = str(body.country);
    if (!country) {
      return NextResponse.json({ error: "Country is required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const payload = {
      client_code: str(body.client_code),
      company_name,
      company_website: str(body.company_website),
      industry_type: str(body.industry_type),
      company_size: str(body.company_size),
      year_established: num(body.year_established),
      company_address: str(body.company_address),
      city: str(body.city),
      state: str(body.state),
      country,
      contact_person,
      contact_full_name,
      contact_designation: str(body.contact_designation),
      contact_work_email: str(body.contact_work_email),
      contact_mobile: str(body.contact_mobile),
      contact_linkedin: str(body.contact_linkedin),
      services_products_offered: str(body.services_products_offered),
      target_market: str(body.target_market),
      target_geography: str(body.target_geography),
      current_revenue_range: str(body.current_revenue_range),
      existing_crm: bool(body.existing_crm),
      existing_crm_which: str(body.existing_crm_which),
      problem_solving: str(body.problem_solving),
      services_looking_for: str(body.services_looking_for),
      budget_range: str(body.budget_range),
      expected_start_date: date(body.expected_start_date),
    };

    const { error } = await admin
      .from("clients")
      .update(payload as never)
      .eq("id", clientId)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to update client" }, { status: 500 });
    }

    if (payload.contact_mobile) {
      await ensureClientWhatsAppLinked(admin, clientId, payload.contact_mobile);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Update client error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserContext();
    if ("error" in ctx) return ctx.error;
    const { orgId } = ctx;

    const clientId = params.id;
    if (!clientId) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { error } = await admin
      .from("clients")
      .delete()
      .eq("id", clientId)
      .eq("organization_id", orgId);

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to delete client" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete client error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
