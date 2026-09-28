import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ leadId: string }> };

async function assertLeadAccess(supabase: Awaited<ReturnType<typeof createClient>>, leadUuid: string) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, organization_id")
    .eq("id", leadUuid)
    .single();

  if (leadErr || !lead) {
    return { error: NextResponse.json({ error: "Lead not found" }, { status: 404 }) };
  }

  if ((lead as { organization_id: string }).organization_id !== orgId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId };
}

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    const { leadId } = await ctx.params;
    const supabase = await createClient();
    const access = await assertLeadAccess(supabase, leadId);
    if ("error" in access) return access.error;

    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, direction, body, status, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type MessageRow = {
      id: string;
      direction: string;
      body: string;
      status: string | null;
      created_at: string;
    };

    const messages = ((rows ?? []) as MessageRow[]).map((m) => ({
      id: m.id,
      direction: m.direction as "inbound" | "outbound",
      body: m.body,
      createdAt: m.created_at,
      status: m.status as "sent" | "delivered" | "read" | "failed",
    }));

    return NextResponse.json({ messages });
  } catch (e) {
    console.error("GET messages:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { leadId } = await ctx.params;
    const supabase = await createClient();
    const access = await assertLeadAccess(supabase, leadId);
    if ("error" in access) return access.error;

    const body = (await request.json()) as { body?: string };
    const text = body.body?.trim();
    if (!text) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
    }

    const { data: contact } = await admin
      .from("lead_contacts")
      .select("wa_number")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!contact) {
      return NextResponse.json(
        {
          error:
            "WhatsApp is not linked for this lead. An admin must add the contact number in lead_contacts (agents never see the number).",
        },
        { status: 400 }
      );
    }

    // TODO: call Meta WhatsApp Cloud API with contact.wa_number server-side only.
    const { data: inserted, error: insErr } = await supabase
      .from("messages")
      .insert({
        lead_id: leadId,
        direction: "outbound",
        body: text,
        status: "sent",
        sent_by: access.user.id,
      } as never)
      .select("id, direction, body, status, created_at")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
    }

    const row = inserted as {
      id: string;
      direction: string;
      body: string;
      status: string;
      created_at: string;
    };

    return NextResponse.json({
      message: {
        id: row.id,
        direction: "outbound",
        body: row.body,
        createdAt: row.created_at,
        status: row.status,
      },
    });
  } catch (e) {
    console.error("POST message:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
