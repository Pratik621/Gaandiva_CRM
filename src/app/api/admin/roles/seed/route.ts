import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_ROLES = [
  { name: "Admin", description: "Full access to organization settings and Users" },
  { name: "admin_support", description: "Restricted access to Users, Devices, and Settings only" },
  { name: "Team Leader", description: "Manage campaigns and agents within the team" },
  { name: "Agent", description: "Assigned to campaigns and leads" },
  { name: "Sales Manager", description: "Sales manager – can view entire sales team performance" },
  { name: "Sales", description: "Sales team member – can view only their own performance" },
  { name: "QA", description: "Quality assurance team member" },
  { name: "MIS", description: "Management Information System - reporting and data management" },
  { name: "MIS_TL", description: "MIS Team Leader - reporting and data management" },
  { name: "QA_TL", description: "Quality Team Leader - reporting and data management" },
  {
    name: "Email Marketing Manager",
    description: "Email marketing — Lead Finder, campaigns, and leads",
  },
  // Campaign Command Center roles
  { name: "client_viewer", description: "Read-only access for external clients — sees only their own campaigns and leads" },
  { name: "internal_operator", description: "Create/edit campaigns, manage leads and status changes" },
  { name: "internal_admin", description: "Full Command Center access — DQ override, alert management, consent review" },
];

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const isAdmin = (roleRows ?? []).some(
      (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() === "admin"
    );

    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization assigned" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    const { data: existingRoles } = await admin
      .from("roles")
      .select("name")
      .eq("organization_id", orgId);

    const existingNames = new Set(
      ((existingRoles ?? []) as { name: string | null }[]).map((r) => r.name?.toLowerCase().trim())
    );
    const toInsert = DEFAULT_ROLES.filter((r) => !existingNames.has(r.name.toLowerCase().trim()));

    if (toInsert.length === 0) {
      return NextResponse.json({
        message: "All default roles already exist",
        created: [],
      });
    }

    const { data: inserted, error } = await admin
      .from("roles")
      .insert(
        toInsert.map((r) => ({
          organization_id: orgId,
          name: r.name,
          description: r.description,
        })) as never
      )
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      message: `Created ${inserted?.length ?? 0} role(s)`,
      created: inserted ?? [],
    });
  } catch (err) {
    console.error("Seed roles error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
