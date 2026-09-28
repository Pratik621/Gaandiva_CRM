import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { isCampaignTeamLeaderRole } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { displayAgentName } from "@/lib/tl/lead-transfer";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";

export const dynamic = "force-dynamic";

type HistoryRow = {
  id: string;
  lead_count: number;
  lead_id: string | null;
  campaign_id: string | null;
  from_agent_id: string;
  to_agent_id: string;
  transferred_by_tl_id: string;
  transfer_mode: string;
  transferred_at: string;
  notes: string | null;
};

/**
 * GET /api/tl/leads/transfer/history
 * Paginated lead transfer history for the current TL's organization.
 */
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isTL = roleNames.some((n) => isCampaignTeamLeaderRole(n));
    if (!isTL) {
      return NextResponse.json(
        { error: "Only Team Leaders can view transfer history" },
        { status: 403 }
      );
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

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const sp = new URL(request.url).searchParams;
    const { page, limit, offset } = parseListPagination(sp);

    const { data: rows, error, count } = await admin
      .from("lead_transfer_history")
      .select(
        "id, lead_count, lead_id, campaign_id, from_agent_id, to_agent_id, transferred_by_tl_id, transfer_mode, transferred_at, notes",
        { count: "exact" }
      )
      .eq("organization_id", orgId)
      .eq("transferred_by_tl_id", user.id)
      .order("transferred_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const historyRows = (rows ?? []) as HistoryRow[];
    const userIds = new Set<string>();
    const campaignIds = new Set<string>();

    for (const row of historyRows) {
      userIds.add(row.from_agent_id);
      userIds.add(row.to_agent_id);
      userIds.add(row.transferred_by_tl_id);
      if (row.campaign_id) campaignIds.add(row.campaign_id);
    }

    const [usersRes, campaignsRes] = await Promise.all([
      userIds.size > 0
        ? admin
            .from("users")
            .select("id, full_name, email, agent_code")
            .in("id", [...userIds])
        : Promise.resolve({ data: [], error: null }),
      campaignIds.size > 0
        ? admin
            .from("campaigns")
            .select("id, name")
            .in("id", [...campaignIds])
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (usersRes.error) {
      return NextResponse.json({ error: usersRes.error.message }, { status: 500 });
    }
    if (campaignsRes.error) {
      return NextResponse.json({ error: campaignsRes.error.message }, { status: 500 });
    }

    type UserLite = {
      id: string;
      full_name: string | null;
      email: string | null;
      agent_code: string | null;
    };
    const userMap = new Map(
      ((usersRes.data ?? []) as UserLite[]).map((u) => [u.id, u])
    );
    const campaignMap = new Map(
      ((campaignsRes.data ?? []) as { id: string; name: string | null }[]).map((c) => [
        c.id,
        c.name,
      ])
    );

    const items = historyRows.map((row) => {
      const fromAgent = userMap.get(row.from_agent_id);
      const toAgent = userMap.get(row.to_agent_id);
      const tl = userMap.get(row.transferred_by_tl_id);
      return {
        id: row.id,
        lead_count: row.lead_count,
        lead_id: row.lead_id,
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_id
          ? campaignMap.get(row.campaign_id) ?? "—"
          : row.transfer_mode === "all"
          ? "All Campaigns"
          : "—",
        from_agent_id: row.from_agent_id,
        from_agent_name: fromAgent ? displayAgentName(fromAgent) : "—",
        to_agent_id: row.to_agent_id,
        to_agent_name: toAgent ? displayAgentName(toAgent) : "—",
        tl_name: tl ? displayAgentName(tl) : "—",
        transfer_mode: row.transfer_mode,
        transferred_at: row.transferred_at,
        notes: row.notes,
      };
    });

    return NextResponse.json({
      items,
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("Transfer history error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
