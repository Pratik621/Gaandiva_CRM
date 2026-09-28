import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

export const dynamic = "force-dynamic";

/** Client-side QA bulk ZIP export — records audit trail server-side. */
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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const canExport =
      roleNames.includes("qa") ||
      roleNames.includes("qa_tl") ||
      roleNames.includes("admin") ||
      roleNames.includes("mis") ||
      roleNames.includes("email_marketing_manager");
    if (!canExport) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      campaign_id?: string;
      campaign_name?: string;
      recording_count?: number;
      row_count?: number;
      export_kind?: "recordings_zip" | "leads_xlsx";
    };

    const exportKind =
      body.export_kind === "leads_xlsx" ? "leads_xlsx" : "recordings_zip";
    const recordingCount = Number(body.recording_count) || 0;
    const rowCount = Number(body.row_count) || 0;
    const campaignName =
      typeof body.campaign_name === "string" ? body.campaign_name.trim() : "";

    if (exportKind === "leads_xlsx") {
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(roleNames),
        category: "exports",
        eventType: "lead_export",
        description: `Exported ${rowCount.toLocaleString()} lead${rowCount === 1 ? "" : "s"} to Excel${
          campaignName ? ` (${campaignName})` : ""
        }`,
        targetType: "campaign",
        targetId: body.campaign_id ?? null,
        targetLabel: campaignName || body.campaign_id || null,
        metadata: {
          row_count: rowCount,
          export_format: "xlsx",
          source: "qa_campaign_client",
        },
        request,
      });
      return NextResponse.json({ success: true });
    }

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "exports",
      eventType: "recording_export",
      description: `Exported ${recordingCount.toLocaleString()} voice recording${
        recordingCount === 1 ? "" : "s"
      } as ZIP${campaignName ? ` (${campaignName})` : ""}`,
      targetType: "campaign",
      targetId: body.campaign_id ?? null,
      targetLabel: campaignName || body.campaign_id || null,
      metadata: {
        recording_count: recordingCount,
        export_format: "zip",
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("QA recording export audit error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
