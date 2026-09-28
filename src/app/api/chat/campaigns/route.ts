import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildClientViewerCampaignScope,
  applyClientViewerCampaignListScope,
  clientViewerScopeHasAccess,
} from "@/lib/command/client-viewer-scope";

export const dynamic = "force-dynamic";

export type ChatInboxCampaignRow = {
  id: string;
  campaignId: string;
  name: string;
};

export type ChatInboxClientRow = {
  id: string;
  companyName: string;
  campaigns: ChatInboxCampaignRow[];
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
      .select("organization_id, client_id, email")
      .eq("id", user.id)
      .single();

    const profileRow = profile as {
      organization_id: string | null;
      client_id: string | null;
      email: string | null;
    } | null;
    const orgId = profileRow?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);

    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
      .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
      .filter(Boolean) as string[];

    const canViewAllClients =
      roleNames.includes("sales_manager") ||
      roleNames.includes("sales") ||
      roleNames.includes("internal_operator") ||
      roleNames.includes("internal_admin") ||
      roleNames.includes("admin");

    const isClientViewer = roleNames.includes("client_viewer");
    const userClientId = profileRow?.client_id ?? null;

    let query = supabase
      .from("campaigns")
      .select("id, campaign_id, name, client_id, client_name, status, clients(company_name)")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .not("client_id", "is", null)
      .order("name", { ascending: true });

    if (!canViewAllClients && isClientViewer) {
      const scope = buildClientViewerCampaignScope(
        profileRow?.email ?? user.email,
        userClientId
      );
      if (!clientViewerScopeHasAccess(scope)) {
        return NextResponse.json({ clients: [] as ChatInboxClientRow[] });
      }
      query = applyClientViewerCampaignListScope(query, scope);
    }

    const { data: rows, error: qErr } = await query;

    if (qErr) {
      return NextResponse.json({ error: qErr.message }, { status: 500 });
    }

    type Raw = {
      id: string;
      campaign_id: string;
      name: string;
      client_id: string;
      client_name: string | null;
      clients: { company_name: string } | null | { company_name: string }[];
    };

    const byClient = new Map<string, ChatInboxClientRow>();

    for (const row of (rows ?? []) as Raw[]) {
      const embedded = row.clients;
      const fromClientTable = Array.isArray(embedded)
        ? embedded[0]?.company_name
        : embedded?.company_name;
      const companyName =
        fromClientTable?.trim() || row.client_name?.trim() || "Unknown client";

      let client = byClient.get(row.client_id);
      if (!client) {
        client = { id: row.client_id, companyName, campaigns: [] };
        byClient.set(row.client_id, client);
      }

      client.campaigns.push({
        id: row.id,
        campaignId: row.campaign_id,
        name: row.name,
      });
    }

    const clients = [...byClient.values()].sort((a, b) =>
      a.companyName.localeCompare(b.companyName)
    );

    return NextResponse.json({ clients });
  } catch (e) {
    console.error("GET /api/chat/campaigns:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
