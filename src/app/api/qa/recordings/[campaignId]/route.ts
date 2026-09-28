import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { buildRecordingDownloadFilename } from "@/lib/qa/recording-filename";
import { createSignedUrlMap, fetchLeadAssetsByCampaign } from "@/lib/lead-assets";

export const dynamic = "force-dynamic";
/** Large campaigns need time to page leads + batch-sign storage URLs. */
export const maxDuration = 60;

const SIGNED_URL_EXPIRY = 60 * 60; // 1 hour
const LEADS_PAGE = 1000;

type LeadRow = {
  id: string;
  lead_id: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  assigned_agent_id: string | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type RecordingEntry = {
  path: string;
  url: string | null;
  display_name: string;
  original_name: string;
  size: number | null;
  created_at: string | null;
};

export type LeadWithRecordings = {
  id: string;
  lead_id: string | null;
  name: string | null;
  email: string | null;
  agent_name: string | null;
  recordings: RecordingEntry[];
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
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

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
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

    const { campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .select("id, name")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    const campaignRow = campaign as { id: string; name: string };

    const assets = await fetchLeadAssetsByCampaign(admin, orgId, campaignId, "voice");

    const assetsByLead = new Map<string, typeof assets>();
    for (const row of assets) {
      const list = assetsByLead.get(row.lead_id) ?? [];
      list.push(row);
      assetsByLead.set(row.lead_id, list);
    }

    if (assetsByLead.size === 0) {
      return NextResponse.json({
        campaign: { id: campaignRow.id, name: campaignRow.name },
        leads: [],
      });
    }

    // Page by campaign_id — never `.in(id, hundredsOfUuids)` (PostgREST URL → "Bad Request").
    const leadsArr: LeadRow[] = [];
    let offset = 0;
    for (;;) {
      const { data: leads, error: leadsErr } = await admin
        .from("leads")
        .select("id, lead_id, name, first_name, last_name, email, assigned_agent_id")
        .eq("campaign_id", campaignId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + LEADS_PAGE - 1);

      if (leadsErr) {
        console.error("QA Recordings leads fetch:", leadsErr.message);
        return NextResponse.json(
          { error: `Failed to load leads: ${leadsErr.message}` },
          { status: 500 }
        );
      }

      const page = (leads ?? []) as LeadRow[];
      for (const lead of page) {
        if (assetsByLead.has(lead.id)) leadsArr.push(lead);
      }
      if (page.length < LEADS_PAGE) break;
      offset += LEADS_PAGE;
    }

    const agentIds = [
      ...new Set(leadsArr.map((l) => l.assigned_agent_id).filter(Boolean) as string[]),
    ];
    const agentMap: Record<string, string> = {};
    if (agentIds.length > 0) {
      const AGENT_CHUNK = 100;
      for (let i = 0; i < agentIds.length; i += AGENT_CHUNK) {
        const slice = agentIds.slice(i, i + AGENT_CHUNK);
        const { data: users } = await admin
          .from("users")
          .select("id, full_name, email")
          .in("id", slice);
        for (const u of (users ?? []) as UserRow[]) {
          agentMap[u.id] = u.full_name?.trim() || u.email || u.id;
        }
      }
    }

    // Signing must not fail the whole page — return null urls if storage batch fails.
    let urlByPath = new Map<string, string | null>();
    try {
      urlByPath = await createSignedUrlMap(
        admin,
        assets.map((a) => a.file_path),
        SIGNED_URL_EXPIRY
      );
    } catch (signErr) {
      console.error("QA Recordings signed URL batch failed:", signErr);
    }

    const leadsWithRecordings: LeadWithRecordings[] = [];

    for (const lead of leadsArr) {
      const leadAssets = assetsByLead.get(lead.id) ?? [];
      if (leadAssets.length === 0) continue;

      const agentName = lead.assigned_agent_id
        ? (agentMap[lead.assigned_agent_id] ?? "Unknown")
        : "Unknown";
      const leadName =
        [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
        lead.name ||
        lead.lead_id ||
        lead.id;

      const recordings: RecordingEntry[] = leadAssets.map((row) => {
        const dateStr = formatDate(row.created_at);
        return {
          path: row.file_path,
          url: urlByPath.get(row.file_path) ?? null,
          display_name: buildRecordingDownloadFilename({
            agentName,
            campaignName: campaignRow.name,
            email: lead.email,
            date: dateStr || "Unknown-Date",
            originalName: row.file_name,
          }),
          original_name: row.file_name,
          size: row.file_size,
          created_at: row.created_at,
        };
      });

      leadsWithRecordings.push({
        id: lead.id,
        lead_id: lead.lead_id,
        name: leadName,
        email: lead.email ?? null,
        agent_name: agentName,
        recordings,
      });
    }

    return NextResponse.json({
      campaign: { id: campaignRow.id, name: campaignRow.name },
      leads: leadsWithRecordings,
    });
  } catch (err) {
    console.error("QA Recordings GET error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
