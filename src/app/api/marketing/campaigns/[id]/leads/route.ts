import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

    const { data, error } = await fetchAllRows<Record<string, unknown>>((from, to) =>
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

    return NextResponse.json({ leads: data });
  } catch (err) {
    console.error("List simplified leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
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
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const property = typeof body.property === "string" ? body.property.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";

    if (!name && !phone && !email) {
      return NextResponse.json(
        { error: "At least a name, phone, or email is required" },
        { status: 400 }
      );
    }

    const rawData: Record<string, string> = {};
    if (property) rawData["Property Count"] = property;
    if (notes) rawData["Notes"] = notes;

    const { data, error } = await supabase
      .from("simplified_leads")
      .insert({
        organization_id: orgId,
        simplified_campaign_id: id,
        name: name || null,
        phone: phone || null,
        email: email || null,
        raw_data: rawData,
        status: "new",
        created_by: user.id,
      } as never)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ lead: data });
  } catch (err) {
    console.error("Create simplified lead error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
