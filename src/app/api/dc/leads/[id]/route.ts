import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { isLeadInDcScope, verifyDcRole } from "@/lib/dc/access";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
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

    const isDC = await verifyDcRole(supabase, user.id, orgId);
    if (!isDC) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const inScope = await isLeadInDcScope(admin, orgId, leadId);
    if (!inScope) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: lead, error } = await admin
      .from("leads")
      .select("*, campaigns(campaign_questions, client_name)")
      .eq("id", leadId)
      .eq("organization_id", orgId)
      .single();

    if (error || !lead) {
      return NextResponse.json({ error: error?.message ?? "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ lead });
  } catch (err) {
    console.error("DC lead GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
