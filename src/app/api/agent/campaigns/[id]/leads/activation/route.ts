import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveCallLogsLeadContext, setCallLogsLeadsActive } from "@/lib/call-logs-leads";

export const dynamic = "force-dynamic";

const MAX_IDS = 500;

/**
 * PATCH { ids: string[], active: boolean }
 * Activate / deactivate the agent's leads. Only for agent + campaign pairs whose
 * leads live in the Call Logs DB (CALLLOGS_LEADS_* env); the main DB is not written.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const { data: assignment } = await supabase
      .from("campaign_assignments")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("agent_id", user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!assignment) {
      return NextResponse.json({ error: "You are not assigned to this campaign" }, { status: 403 });
    }

    const ctx = await resolveCallLogsLeadContext({
      mainDb: supabase,
      userId: user.id,
      userEmail: user.email,
      orgId,
      campaignId,
    });
    if (ctx instanceof NextResponse) return ctx;
    if (!ctx) {
      return NextResponse.json(
        { error: "Lead activation is not available for this campaign" },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as { ids?: unknown; active?: unknown } | null;
    const ids = Array.isArray(body?.ids)
      ? [...new Set(body!.ids.filter((v): v is string => typeof v === "string" && v.length > 0))]
      : [];
    if (ids.length === 0 || typeof body?.active !== "boolean") {
      return NextResponse.json({ error: "ids (array) and active (boolean) are required" }, { status: 400 });
    }
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `Maximum ${MAX_IDS} leads per request` }, { status: 400 });
    }

    const updated = await setCallLogsLeadsActive(ctx, ids, body.active);
    return NextResponse.json({ updated });
  } catch (err) {
    console.error("Lead activation error:", err);
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
