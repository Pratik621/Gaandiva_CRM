import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildLeadsExportBuffer, type ExportableLead } from "@/lib/marketing/leads-export";
import { fetchAllRows } from "@/lib/marketing/fetch-all";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: campaign } = await supabase
      .from("simplified_campaigns")
      .select("name")
      .eq("id", id)
      .single();

    const { data: leads, error } = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("simplified_leads")
        .select("*")
        .eq("simplified_campaign_id", id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    );

    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const buffer = buildLeadsExportBuffer(leads as unknown as ExportableLead[], false);
    const campaignName = (campaign as { name: string } | null)?.name || "leads";
    const filename = `${campaignName}-leads.xlsx`.replace(/[^a-zA-Z0-9.\-_ ]+/g, "_");

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Export campaign leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
