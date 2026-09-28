import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DC_CLIENT_NAME = "DC";

async function verifyDC(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name")
    .eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

export async function GET() {
  try {
    // Auth check uses session client (RLS-aware)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const isDC = await verifyDC(supabase, user.id, orgId);
    if (!isDC) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // All data queries use admin client to bypass RLS
    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    // Fetch all campaigns in org with client info
    const { data: allCamps } = await admin
      .from("campaigns")
      .select("id, name, client_name, client_id")
      .eq("organization_id", orgId);

    type CampRow = { id: string; name: string; client_name: string | null; client_id: string | null };
    const camps = (allCamps ?? []) as CampRow[];

    // Resolve client names via client_id FK
    const clientIds = [...new Set(camps.map((c) => c.client_id).filter(Boolean))] as string[];
    const clientNameById: Record<string, string> = {};
    if (clientIds.length > 0) {
      const { data: clients } = await admin
        .from("clients")
        .select("id, company_name")
        .in("id", clientIds);
      ((clients ?? []) as { id: string; company_name: string }[]).forEach((cl) => {
        clientNameById[cl.id] = cl.company_name;
      });
    }

    // Match campaigns where client_name OR company_name = "DC"
    const matched = camps.filter((c) => {
      const direct = (c.client_name ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase();
      const viaClient = c.client_id
        ? (clientNameById[c.client_id] ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase()
        : false;
      return direct || viaClient;
    });

    const campaignIds = matched.map((c) => c.id);

    // Debug info
    const distinctClientNames = [
      ...new Set([
        ...camps.map((c) => c.client_name).filter(Boolean),
        ...Object.values(clientNameById),
      ]),
    ];
    const debug = {
      orgId,
      totalCampaignsInOrg: camps.length,
      distinctClientNames,
      searchingFor: DC_CLIENT_NAME,
      matchedCount: campaignIds.length,
    };

    if (campaignIds.length === 0) {
      return NextResponse.json({
        totalCampaigns: 0, totalLeads: 0, qualifiedLeads: 0,
        deliveredLeads: 0, deliveredToday: 0, _debug: debug,
      });
    }

    const { data: leads } = await admin
      .from("leads")
      .select("id, status, qa_status, delivery_status, updated_at, created_at")
      .in("campaign_id", campaignIds)
      .eq("organization_id", orgId);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    type LeadRow = {
      id: string; status: string | null; qa_status: string | null;
      delivery_status: string | null; updated_at: string | null; created_at: string;
    };
    const leadList = (leads ?? []) as LeadRow[];

    const isQualified = (l: LeadRow) =>
      (l.status ?? "").trim().toLowerCase() === "qualified" ||
      (l.qa_status ?? "").trim().toLowerCase() === "qualified";

    return NextResponse.json({
      totalCampaigns: campaignIds.length,
      totalLeads: leadList.length,
      qualifiedLeads: leadList.filter(isQualified).length,
      deliveredLeads: leadList.filter((l) => l.delivery_status === "delivered_by_mis").length,
      deliveredToday: leadList.filter((l) => {
        const d = new Date(l.updated_at ?? l.created_at);
        return d >= todayStart && l.delivery_status === "delivered_by_mis";
      }).length,
      _debug: debug,
    });
  } catch (err) {
    console.error("DC dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
