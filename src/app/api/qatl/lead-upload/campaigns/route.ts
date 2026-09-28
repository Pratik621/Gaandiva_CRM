import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type DeliveredLeadAggRow = {
  campaign_id: string;
  campaigns: { id: string; name: string; campaign_code: string | null } | null;
};

export async function GET() {
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

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);
    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[]).map((r) =>
      r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_")
    );
    const canView = roleNames.includes("qa_tl") || roleNames.includes("admin");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden: QA TL or Admin role required" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: deliveredRows, error: deliveredErr } = await admin
      .from("leads")
      .select("campaign_id, campaigns(id, name, campaign_code)")
      .eq("organization_id", orgId)
      .eq("delivery_status", "delivered");

    if (deliveredErr) {
      return NextResponse.json({ error: deliveredErr.message }, { status: 500 });
    }

    const rows = (deliveredRows ?? []) as DeliveredLeadAggRow[];
    const grouped = new Map<
      string,
      { campaign_id: string; campaign_name: string; campaign_code: string | null; delivered_leads_count: number }
    >();

    rows.forEach((row) => {
      const campaignKey = row.campaigns?.id ?? row.campaign_id;
      if (!campaignKey) return;
      const existing = grouped.get(campaignKey);
      if (existing) {
        existing.delivered_leads_count += 1;
        return;
      }
      grouped.set(campaignKey, {
        campaign_id: campaignKey,
        campaign_name: row.campaigns?.name ?? "Unnamed Campaign",
        campaign_code: row.campaigns?.campaign_code ?? null,
        delivered_leads_count: 1,
      });
    });

    const campaigns = Array.from(grouped.values()).sort(
      (a, b) => b.delivered_leads_count - a.delivered_leads_count || a.campaign_name.localeCompare(b.campaign_name)
    );

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("QATL lead upload campaigns error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
