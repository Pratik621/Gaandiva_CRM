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
  const { data: roles } = await supabase.from("roles").select("id, name").eq("organization_id", orgId);
  const dcRoles = ((roles ?? []) as { id: string; name: string | null }[]).filter(
    (r) => r.name?.toLowerCase() === "dc"
  );
  if (dcRoles.length === 0) return false;
  const { data: ur } = await supabase
    .from("user_roles").select("role_id").eq("user_id", userId)
    .in("role_id", dcRoles.map((r) => r.id));
  return (ur ?? []).length > 0;
}

async function getDCCampaignIds(
  admin: NonNullable<ReturnType<typeof getAdminClientSafe>>,
  orgId: string
): Promise<string[]> {
  const { data: allCamps } = await admin
    .from("campaigns")
    .select("id, client_name, client_id")
    .eq("organization_id", orgId);

  type CampRow = { id: string; client_name: string | null; client_id: string | null };
  const camps = (allCamps ?? []) as CampRow[];

  const clientIds = [...new Set(camps.map((c) => c.client_id).filter(Boolean))] as string[];
  const clientNameById: Record<string, string> = {};
  if (clientIds.length > 0) {
    const { data: clients } = await admin.from("clients").select("id, company_name").in("id", clientIds);
    ((clients ?? []) as { id: string; company_name: string }[]).forEach((cl) => {
      clientNameById[cl.id] = cl.company_name;
    });
  }

  return camps
    .filter((c) => {
      const direct = (c.client_name ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase();
      const viaClient = c.client_id
        ? (clientNameById[c.client_id] ?? "").trim().toLowerCase() === DC_CLIENT_NAME.toLowerCase()
        : false;
      return direct || viaClient;
    })
    .map((c) => c.id);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("users").select("organization_id").eq("id", user.id).single();
    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) return NextResponse.json({ error: "No organization" }, { status: 400 });

    const isDC = await verifyDC(supabase, user.id, orgId);
    if (!isDC) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = getAdminClientSafe();
    if (!admin) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

    const campaignIds = await getDCCampaignIds(admin, orgId);
    if (campaignIds.length === 0) return NextResponse.json({ campaigns: [] });

    const { data: camps, error: campsErr } = await admin
      .from("campaigns")
      .select("id, campaign_id, name, status, start_date, end_date, created_at, client_name")
      .in("id", campaignIds)
      .order("created_at", { ascending: false });

    if (campsErr) return NextResponse.json({ error: campsErr.message }, { status: 500 });

    const { data: leads } = await admin
      .from("leads")
      .select("id, campaign_id, status, qa_status, delivery_status")
      .in("campaign_id", campaignIds)
      .eq("organization_id", orgId);

    type LeadRow = { id: string; campaign_id: string; status: string | null; qa_status: string | null; delivery_status: string | null };
    const isQualified = (l: LeadRow) =>
      (l.status ?? "").trim().toLowerCase() === "qualified" ||
      (l.qa_status ?? "").trim().toLowerCase() === "qualified";

    const stats: Record<string, { total: number; qualified: number; delivered: number }> = {};
    ((leads ?? []) as LeadRow[]).forEach((l) => {
      if (!stats[l.campaign_id]) stats[l.campaign_id] = { total: 0, qualified: 0, delivered: 0 };
      stats[l.campaign_id].total++;
      if (isQualified(l)) stats[l.campaign_id].qualified++;
      if (l.delivery_status === "delivered_by_mis") stats[l.campaign_id].delivered++;
    });

    type CampRow = { id: string; campaign_id: string | null; name: string; status: string; start_date: string | null; end_date: string | null; created_at: string; client_name: string | null };
    const campaigns = ((camps ?? []) as CampRow[]).map((c) => ({
      id: c.id,
      campaign_id: c.campaign_id,
      name: c.name,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date,
      created_at: c.created_at,
      client_name: c.client_name,
      total_leads: stats[c.id]?.total ?? 0,
      qualified_leads: stats[c.id]?.qualified ?? 0,
      delivered_leads: stats[c.id]?.delivered ?? 0,
    }));

    return NextResponse.json({ campaigns });
  } catch (err) {
    console.error("DC campaigns error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
