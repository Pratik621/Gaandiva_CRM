import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasCommandRole } from "@/lib/command/rules-engine";
import {
  getProfile,
  getRoleNames,
} from "@/lib/command/db";
import { getClientViewerCampaignIds } from "@/lib/command/client-viewer-scope";

export const dynamic = "force-dynamic";

const LIMIT = 6;

type SearchCategory = "all" | "campaigns" | "leads" | "alerts";
type CampaignSearchRow = {
  id: string;
  name: string | null;
  campaign_id: string | null;
  client_name: string | null;
  status: string | null;
};
type LeadSearchRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  campaign_id: string | null;
};
type AlertSearchRow = {
  id: string;
  title: string | null;
  message: string | null;
  severity: string | null;
  campaign_id: string | null;
};

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roles = await getRoleNames(supabase, user.id);
    const isClientViewer = roles.includes("client_viewer");
    const isAllowed = hasCommandRole(roles) || isClientViewer;
    if (!isAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const profile = await getProfile(supabase, user.id);
    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const category = (searchParams.get("category") ?? "all") as SearchCategory;

    if (!q) {
      return NextResponse.json({ results: { campaigns: [], leads: [], alerts: [] } });
    }

    const pattern = `%${q}%`;
    const allowedCampaignIds = isClientViewer
      ? await getClientViewerCampaignIds(
          supabase,
          profile.organization_id,
          profile.client_id ?? null,
          user.email
        )
      : null;

    if (isClientViewer && allowedCampaignIds && allowedCampaignIds.length === 0) {
      return NextResponse.json({ results: { campaigns: [], leads: [], alerts: [] } });
    }

    const results: {
      campaigns: Array<Record<string, unknown>>;
      leads: Array<Record<string, unknown>>;
      alerts: Array<Record<string, unknown>>;
    } = { campaigns: [], leads: [], alerts: [] };

    if (category === "all" || category === "campaigns") {
      let campaignQ = admin
        .from("campaigns")
        .select("id, name, campaign_id, client_name, status")
        .eq("organization_id", profile.organization_id)
        .or(`name.ilike.${pattern},campaign_id.ilike.${pattern},client_name.ilike.${pattern}`)
        .limit(LIMIT);

      if (allowedCampaignIds) campaignQ = campaignQ.in("id", allowedCampaignIds);
      const { data } = await campaignQ;
      const rows = (data ?? []) as CampaignSearchRow[];
      results.campaigns = rows.map((row) => ({
        id: String(row.id),
        title: String(row.name ?? row.campaign_id ?? "—"),
        subtitle: String(row.client_name ?? row.campaign_id ?? "—"),
        meta: row.status ? String(row.status) : null,
        type: "campaign",
        url: `/dashboard/campaigns/${row.id}`,
      }));
    }

    if (category === "all" || category === "leads") {
      let leadQ = admin
        .from("leads")
        .select("id, name, email, phone, company_name, status, campaign_id")
        .eq("organization_id", profile.organization_id)
        .or(
          `name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},company_name.ilike.${pattern}`
        )
        .limit(LIMIT);

      if (allowedCampaignIds) leadQ = leadQ.in("campaign_id", allowedCampaignIds);
      const { data } = await leadQ;
      const rows = (data ?? []) as LeadSearchRow[];
      results.leads = rows.map((row) => ({
        id: String(row.id),
        title: String(row.name ?? "—"),
        subtitle: String(row.email ?? row.phone ?? "—"),
        meta: row.company_name ? String(row.company_name) : null,
        type: "lead",
        url: row.campaign_id
          ? `/dashboard/campaigns/${row.campaign_id}?tab=leads`
          : "/dashboard/leads",
      }));
    }

    if (category === "all" || category === "alerts") {
      let alertQ = admin
        .from("alerts")
        .select("id, title, message, severity, campaign_id, is_resolved")
        .eq("organization_id", profile.organization_id)
        .or(`title.ilike.${pattern},message.ilike.${pattern},severity.ilike.${pattern}`)
        .limit(LIMIT);

      if (allowedCampaignIds) alertQ = alertQ.in("campaign_id", allowedCampaignIds);
      const { data } = await alertQ;
      const rows = (data ?? []) as AlertSearchRow[];
      results.alerts = rows.map((row) => ({
        id: String(row.id),
        title: String(row.title ?? "Alert"),
        subtitle: String(row.message ?? "—"),
        meta: row.severity ? String(row.severity) : null,
        type: "alert",
        url: row.campaign_id
          ? `/dashboard/campaigns/${row.campaign_id}?tab=alerts`
          : "/dashboard/campaigns",
      }));
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Dashboard search error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
