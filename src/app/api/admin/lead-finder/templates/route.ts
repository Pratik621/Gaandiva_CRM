import { NextResponse } from "next/server";
import { verifyLeadFinderAccess } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { validateFilters } from "@/lib/lead-finder/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await verifyLeadFinderAccess();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId } = ctx as { orgId: string };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data, error } = await admin
      .from("lead_finder_templates")
      .select("id, name, filters, created_at")
      .eq("organization_id", orgId)
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    console.error("Lead finder templates error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Save a filter set as a named template (upsert by name). */
export async function POST(request: Request) {
  try {
    const ctx = await verifyLeadFinderAccess();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId, user } = ctx as { orgId: string; user: { id: string } };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const body = (await request.json().catch(() => null)) as {
      name?: string;
      filters?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }
    const validation = validateFilters(body?.filters);
    if (!validation.filters) {
      return NextResponse.json(
        { error: "Invalid filters", details: validation.errors },
        { status: 400 }
      );
    }

    const { data, error } = await admin
      .from("lead_finder_templates")
      .upsert(
        {
          organization_id: orgId,
          name,
          filters: validation.filters as never,
          created_by: user.id,
        } as never,
        { onConflict: "organization_id,name" }
      )
      .select("id, name, filters, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    console.error("Lead finder template save error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
