import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { logAudit } from "@/lib/audit/log";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { sendLeadStatusEvent } from "@/lib/marketing/meta-conversions";

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

    const { data: lead, error: leadError } = await supabase
      .from("simplified_leads")
      .select("*, simplified_campaigns(name, external_campaign_id)")
      .eq("id", id)
      .single();

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 404 });
    }

    const { data: calls, error: callsError } = await supabase
      .from("simplified_lead_calls")
      .select("*")
      .eq("simplified_lead_id", id)
      .order("called_at", { ascending: false });

    if (callsError) {
      return NextResponse.json({ error: callsError.message }, { status: 500 });
    }

    return NextResponse.json({ lead, calls: calls ?? [] });
  } catch (err) {
    console.error("Get sm-agent lead error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

const VALID_STATUSES = ["new", "follow_up", "in_progress", "closed"];

/**
 * Direct status + notes update — the primary way agents mark progress on a
 * lead. This does not write a simplified_lead_calls history row; it's a
 * simple, direct override rather than the outcome-driven call-logging flow.
 * Only sm_agent may update (also enforced in the DB by
 * trg_guard_simplified_lead_status_change). A status change on a Meta lead is
 * reported back to Meta as a CRM lead event.
 */
export async function PATCH(
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!roleNames.includes("sm_agent")) {
      return NextResponse.json(
        { error: "Only sm_agent users can update a lead's status" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const status = typeof body.status === "string" ? body.status : "";
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", user.id)
      .single();
    const updaterProfile = profile as { full_name: string | null; email: string } | null;
    const updaterName = updaterProfile?.full_name || updaterProfile?.email || "Unknown";

    const { data: existing } = await supabase
      .from("simplified_leads")
      .select("status, name, phone, email, organization_id, meta_lead_id, raw_data")
      .eq("id", id)
      .single();
    const existingLead = existing as {
      status: string;
      name: string | null;
      phone: string | null;
      email: string | null;
      organization_id: string;
      meta_lead_id: string | null;
      raw_data: Record<string, string> | null;
    } | null;

    const update: Record<string, unknown> = {
      status,
      updated_by: user.id,
      updated_by_name: updaterName,
    };
    if (status === "closed") update.resolved_at = new Date().toISOString();
    if (status === "follow_up") {
      update.callback_at = typeof body.callback_at === "string" ? body.callback_at : null;
    }
    if (typeof body.notes === "string") {
      update.call_form_response = { notes: body.notes };
    }

    const { data, error } = await supabase
      .from("simplified_leads")
      .update(update as never)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (existingLead?.organization_id) {
      const leadLabel = existingLead.name || existingLead.phone || "lead";
      void logAudit({
        organizationId: existingLead.organization_id,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(roleNames),
        category: "leads",
        eventType: "simplified_lead_updated",
        description:
          existingLead.status !== status
            ? `${updaterName} changed "${leadLabel}" status from ${existingLead.status} to ${status}`
            : `${updaterName} updated "${leadLabel}" (notes/callback)`,
        targetType: "simplified_lead",
        targetId: id,
        targetLabel: leadLabel,
        metadata: {
          previous_status: existingLead.status,
          new_status: status,
          notes: typeof body.notes === "string" ? body.notes : undefined,
        },
        request,
      });
    }

    if (existingLead && existingLead.status !== status) {
      const admin = getAdminClientSafe();
      // Awaited (not fire-and-forget): serverless functions can be frozen as
      // soon as the response is sent. A Meta failure never fails the update.
      if (admin) {
        const result = await sendLeadStatusEvent(admin, { ...existingLead, status });
        if (result.error) console.error("Meta CRM lead event failed:", result.error);
      }
    }

    return NextResponse.json({ lead: data });
  } catch (err) {
    console.error("Update sm-agent lead status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
