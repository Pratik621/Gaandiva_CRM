import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { insertImportedLeads, type ImportLeadRow } from "@/lib/marketing/leads-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

    const body = await request.json();
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    const rows: ImportLeadRow[] = Array.isArray(body.leads) ? body.leads : [];

    const result = await insertImportedLeads(supabase, {
      organizationId: orgId,
      campaignId,
      userId: user.id,
      rows,
    });

    if (result.error && result.created === 0) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Import marketing leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
