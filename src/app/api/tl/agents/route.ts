import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const { data: roles } = await supabase
      .from("roles")
      .select("id, name")
      .eq("organization_id", orgId);
    const rolesList = (roles ?? []) as { id: string; name: string | null }[];
    const agentRole = rolesList.find(
      (r) => r.name?.toLowerCase() === "agent"
    );

    if (!agentRole) {
      return NextResponse.json({ agents: [] });
    }

    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role_id", agentRole.id);

    const agentIds = ((userRoles ?? []) as { user_id: string }[]).map((ur) => ur.user_id);
    if (agentIds.length === 0) {
      return NextResponse.json({ agents: [] });
    }

    const { data: agents } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId)
      .in("id", agentIds);

    return NextResponse.json({ agents: agents ?? [] });
  } catch (err) {
    console.error("Fetch agents error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
