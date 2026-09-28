import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isLeadInDcScope, verifyDcRole } from "@/lib/dc/access";
import { listLhoFilesForLead } from "@/lib/lead-assets";

export const dynamic = "force-dynamic";

type LeadRecord = {
  id: string;
  campaign_id: string;
  organization_id: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

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

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    const inScope = await isLeadInDcScope(admin, orgId, leadId);
    if (!inScope) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { data: leadRaw, error: leadError } = await admin
      .from("leads")
      .select("id, campaign_id, organization_id")
      .eq("id", leadId)
      .eq("organization_id", orgId)
      .single();

    if (leadError || !leadRaw) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = leadRaw as LeadRecord;
    const files = await listLhoFilesForLead(admin, admin, orgId, lead);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("DC LHO GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
