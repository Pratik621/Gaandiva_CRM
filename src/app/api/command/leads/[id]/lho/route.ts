import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, getProfile } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  applyClientViewerLeadScope,
} from "@/lib/command/client-viewer-scope";
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
      return NextResponse.json(
        { error: ADMIN_NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoles = await getRoleNames(supabase, user.id);
    if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const profile = await getProfile(supabase, user.id);
    const orgId = profile?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: leadId } = await params;
    if (!leadId) {
      return NextResponse.json({ error: "Lead ID required" }, { status: 400 });
    }

    let leadQuery = supabase
      .from("leads")
      .select("id, campaign_id, organization_id, campaigns(client_id)")
      .eq("id", leadId);

    if (userRoles.includes("client_viewer")) {
      const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
      leadQuery = applyClientViewerLeadScope(leadQuery, scope, { joinOnCampaigns: true });
    }

    const { data: leadRaw, error: leadError } = await leadQuery.single();

    if (leadError || !leadRaw) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = leadRaw as LeadRecord & { organization_id: string };
    if (lead.organization_id !== orgId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const files = await listLhoFilesForLead(admin, admin, orgId, lead);
    return NextResponse.json({ files });
  } catch (err) {
    console.error("Command LHO GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
