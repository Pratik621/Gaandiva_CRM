import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["active", "paused", "completed"] as const;

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

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);
    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[]).map((r) =>
      r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_")
    );
    const canEdit = roleNames.includes("mis") || roleNames.includes("admin");
    if (!canEdit) {
      return NextResponse.json(
        { error: "Forbidden: only MIS can update campaign status" },
        { status: 403 }
      );
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const body = (await request.json()) as { status?: string };
    const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    if (!ALLOWED_STATUSES.includes(status as (typeof ALLOWED_STATUSES)[number])) {
      return NextResponse.json(
        { error: "Invalid status. Use active, paused, or completed." },
        { status: 400 }
      );
    }

    const { data: existing, error: fetchError } = await admin
      .from("campaigns")
      .select("id, name, status")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const { data: updated, error: updateError } = await admin
      .from("campaigns")
      .update({ status, updated_at: new Date().toISOString() } as never)
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .select("id, status")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const prev = existing as { id: string; name: string; status: string };
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_status_changed",
      description: `Changed campaign status from ${prev.status} to ${status}`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: prev.name,
      metadata: { previous_status: prev.status, new_status: status, source: "mis_campaign_tracker" },
      request,
    });

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    console.error("MIS campaign tracker status update error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
