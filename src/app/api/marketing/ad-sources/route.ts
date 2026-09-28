import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", userId)
    .single();
  return (profile as { organization_id: string | null } | null)?.organization_id ?? null;
}


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

    const { data, error } = await supabase
      .from("simplified_ad_sources")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adSources: data ?? [] });
  } catch (err) {
    console.error("List ad sources error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

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

    const orgId = await getOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const sheetUrl = typeof body.sheet_url === "string" ? body.sheet_url.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";

    if (!sheetUrl || !/^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(sheetUrl)) {
      return NextResponse.json(
        { error: "A valid Google Sheets URL is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("simplified_ad_sources")
      .insert({
        organization_id: orgId,
        sheet_url: sheetUrl,
        label: label || null,
        added_by: user.id,
      } as never)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ adSource: data });
  } catch (err) {
    console.error("Add ad source error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
