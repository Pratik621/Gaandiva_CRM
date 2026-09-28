import type { SupabaseClient } from "@supabase/supabase-js";
import { QA_VISIBLE_LEAD_TAGGING_VALUES } from "@/lib/lead-tagging";
import { chunkIds, fetchAllByIdChunks } from "@/lib/supabase/in-chunks";

const TL_DASHBOARD_LEAD_SELECT =
  "id, status, qa_status, delivery_status, campaign_id, created_at";

export type TlDashboardLeadRow = {
  id: string;
  status: string;
  qa_status: string | null;
  delivery_status: string | null;
  campaign_id: string | null;
  created_at: string;
};

/** Paginated + chunked fetch — avoids URL/header overflow on large campaign ID lists. */
export async function fetchTlDashboardLeads(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[]
): Promise<TlDashboardLeadRow[]> {
  if (campaignIds.length === 0) return [];

  return fetchAllByIdChunks<TlDashboardLeadRow>(
    campaignIds,
    async (idChunk, from, to) =>
      supabase
        .from("leads")
        .select(TL_DASHBOARD_LEAD_SELECT)
        .eq("organization_id", orgId)
        .in("campaign_id", idChunk)
        .order("created_at", { ascending: true })
        .range(from, to)
  );
}

export type TlCampaignLeadCounts = {
  total: number;
  qualified: number;
  disqualified: number;
  delivered: number;
};

type TlCampaignLeadCountsRpcRow = {
  campaign_id: string;
  total_leads: number | string;
  qualified_leads: number | string;
  disqualified_leads: number | string;
  delivered_leads: number | string;
};

/** SQL aggregation (fast). Falls back to paginated row scan if RPC is not deployed yet. */
export async function aggregateTlLeadCountsByCampaign(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[]
): Promise<Record<string, TlCampaignLeadCounts>> {
  const empty = (): TlCampaignLeadCounts => ({ total: 0, qualified: 0, disqualified: 0, delivered: 0 });
  const out: Record<string, TlCampaignLeadCounts> = {};
  for (const id of campaignIds) out[id] = empty();
  if (campaignIds.length === 0) return out;

  // Chunk RPC args too — very large uuid[] payloads can still fail on some proxies.
  let rpcOk = true;
  for (const idChunk of chunkIds(campaignIds)) {
    const { data, error } = await supabase.rpc("tl_campaign_lead_counts", {
      p_org_id: orgId,
      p_campaign_ids: idChunk,
    });

    if (error) {
      rpcOk = false;
      console.warn(
        "aggregateTlLeadCountsByCampaign: RPC unavailable, using paginated fallback:",
        error.message
      );
      break;
    }

    const rows = (data ?? []) as TlCampaignLeadCountsRpcRow[];
    const rpcHasDisqualified =
      rows.length === 0 ||
      rows.some((row) => row.disqualified_leads !== undefined && row.disqualified_leads !== null);

    if (!rpcHasDisqualified) {
      rpcOk = false;
      console.warn(
        "aggregateTlLeadCountsByCampaign: RPC missing disqualified_leads, using paginated fallback"
      );
      break;
    }

    for (const row of rows) {
      if (!row.campaign_id) continue;
      out[row.campaign_id] = {
        total: Number(row.total_leads) || 0,
        qualified: Number(row.qualified_leads) || 0,
        disqualified: Number(row.disqualified_leads) || 0,
        delivered: Number(row.delivered_leads) || 0,
      };
    }
  }

  if (rpcOk) return out;

  const leads = await fetchTlDashboardLeads(supabase, orgId, campaignIds);
  return { ...out, ...tallyTlDashboardLeadCounts(leads) };
}

/** Scored-lead counts per campaign (MIS / DC list views). */
export async function aggregateScoredLeadCountsByCampaign(
  supabase: SupabaseClient,
  orgId: string,
  campaignIds: string[]
): Promise<Record<string, { total: number; delivered: number }>> {
  const out: Record<string, { total: number; delivered: number }> = {};
  for (const id of campaignIds) out[id] = { total: 0, delivered: 0 };
  if (campaignIds.length === 0) return out;

  const rows = await fetchAllByIdChunks<{
    campaign_id: string;
    delivery_status: string | null;
  }>(campaignIds, async (idChunk, from, to) =>
    supabase
      .from("leads")
      .select("campaign_id, delivery_status")
      .eq("organization_id", orgId)
      .in("campaign_id", idChunk)
      .in("lead_tagging", QA_VISIBLE_LEAD_TAGGING_VALUES)
      .order("created_at", { ascending: true })
      .range(from, to)
  );

  for (const row of rows) {
    const bucket = out[row.campaign_id];
    if (!bucket) continue;
    bucket.total += 1;
    const ds = String(row.delivery_status ?? "").trim().toLowerCase();
    if (ds === "delivered" || ds === "delivered_by_mis") bucket.delivered += 1;
  }
  return out;
}

export function tallyTlDashboardLeadCounts(
  leads: TlDashboardLeadRow[]
): Record<string, TlCampaignLeadCounts> {
  const byCampaign: Record<string, TlCampaignLeadCounts> = {};

  for (const l of leads) {
    const campaignId = l.campaign_id;
    if (!campaignId) continue;

    if (!byCampaign[campaignId]) {
      byCampaign[campaignId] = { total: 0, qualified: 0, disqualified: 0, delivered: 0 };
    }
    const bucket = byCampaign[campaignId];
    bucket.total += 1;

    const qa = String(l.qa_status ?? "").trim().toLowerCase();
    if (qa === "qualified" || qa === "approved" || qa === "pass") {
      bucket.qualified += 1;
    }
    if (qa === "disqualified") {
      bucket.disqualified += 1;
    }
    if (String(l.delivery_status ?? "").trim().toLowerCase() === "delivered") {
      bucket.delivered += 1;
    }
  }

  return byCampaign;
}
