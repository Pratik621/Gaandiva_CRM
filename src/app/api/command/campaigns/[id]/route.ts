import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import {
  countCampaignLeads,
  enrichCampaignAllocationFields,
  MIS_DELIVERED_ACHIEVED_OPTIONS,
} from "@/lib/campaign-allocation";
import {
  getRoleNames,
  upsertCampaignMetrics,
  appendCampaignMetricsHistory,
  getProfile,
} from "@/lib/command/db";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import {
  buildClientViewerCampaignScope,
  applyClientViewerCampaignListScope,
  guardClientViewerCampaign,
} from "@/lib/command/client-viewer-scope";
import { parsedRowsToLeadInserts } from "@/lib/command/campaignFormLeadPayloads";
import {
  campaignQuestionsToDbValue,
  normalizeCampaignQuestions,
} from "@/lib/campaign-questions";
import { normalizeRevenueSize } from "@/lib/campaign/revenue-size";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { createCampaignLog } from "@/lib/campaign-logs";

const COMMAND_CAMPAIGN_LEAD_IMPORT_MAX = 500;

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  const isAllowed = hasCommandRole(userRoles) || userRoles.includes("client_viewer");
  if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const profile = await getProfile(supabase, user.id);

  let query = supabase
    .from("campaigns")
    .select(`
      *,
      clients(company_name),
      campaign_files(id, file_name, file_path, created_at),
      campaign_metrics(
        sponsor_name,
        total_leads_allocated,
        total_campaign_spend,
        total_leads_delivered,
        daily_reporting,
        channel_split,
        deficit_leads,
        lead_increment,
        lead_replace
      )
    `)
    .eq("id", id);

  if (userRoles.includes("client_viewer")) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    query = applyClientViewerCampaignListScope(query, scope);
  }

  const { data: campaign, error } = await query.single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const campaignObj = campaign as Record<string, unknown>;
  if (!campaignObj.client_name && campaignObj.client_id) {
    const admin = getAdminClientSafe();
    if (admin) {
      const { data: clientRow } = await admin
        .from("clients")
        .select("company_name")
        .eq("id", campaignObj.client_id as string)
        .single();
      campaignObj.client_name =
        (clientRow as { company_name?: string | null } | null)?.company_name ?? null;
    }
  }

  const rawFiles = Array.isArray(campaignObj.campaign_files)
    ? (campaignObj.campaign_files as Array<Record<string, unknown>>)
    : [];
  if (rawFiles.length > 0) {
    const filesWithUrls = await Promise.all(
      rawFiles.map(async (f) => {
        const filePath = String(f.file_path ?? "");
        if (!filePath) return { ...f, download_url: null };
        const { data: signed } = await supabase.storage
          .from("campaign-files")
          .createSignedUrl(filePath, 3600);
        return { ...f, download_url: signed?.signedUrl ?? null };
      })
    );
    campaignObj.campaign_files = filesWithUrls;
  }

  const isClientViewer = userRoles.includes("client_viewer");
  const [totalLeads, deliveredLeads] = await Promise.all([
    countCampaignLeads(supabase, id, { orgId: profile?.organization_id ?? undefined }),
    countCampaignLeads(supabase, id, {
      orgId: profile?.organization_id ?? undefined,
      deliveredOnly: true,
    }),
  ]);
  const enrichedCampaign = enrichCampaignAllocationFields(
    campaignObj,
    { total: totalLeads, delivered: deliveredLeads },
    { ...MIS_DELIVERED_ACHIEVED_OPTIONS, capToAllocation: false }
  );

  return NextResponse.json({ campaign: enrichedCampaign });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  const isCommand = hasCommandRole(userRoles);
  const isClientViewer = userRoles.includes("client_viewer");
  if (!isCommand && !isClientViewer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as Record<string, unknown>;
  const profile = await getProfile(supabase, user.id);
  const admin = getAdminClientSafe();

  if (!isCommand && isClientViewer) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    const allowed = await guardClientViewerCampaign(supabase, scope, id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!admin) {
      return NextResponse.json(
        { error: "Admin API not configured. Set SUPABASE_SERVICE_ROLE_KEY in deployment environment." },
        { status: 503 }
      );
    }
  }

  const allowedFields = [
    "name", "description", "status", "start_date", "end_date",
    "client_id", "client_name", "lead_type", "campaign_type", "lead_aggregated", "cpl", "revenue", "total_allocation",
    "industry", "geography", "revenue_size", "additional_comments", "weekly_call", "weekly_report", "campaign_questions",
  ];

  const fieldsForUser =
    !isCommand && isClientViewer
      ? allowedFields.filter((f) => f !== "client_id" && f !== "client_name")
      : allowedFields;

  const updates: Record<string, unknown> = {};
  for (const field of fieldsForUser) {
    if (field in body) updates[field] = body[field];
  }
  if ("revenue_size" in updates) {
    updates.revenue_size = normalizeRevenueSize(updates.revenue_size);
  }
  if ("campaign_questions" in body) {
    updates.campaign_questions = campaignQuestionsToDbValue(
      normalizeCampaignQuestions(body.campaign_questions)
    );
  }

  // Keep client_name synced when client_id changes via dropdown selection
  if (isCommand && "client_id" in body && !("client_name" in body)) {
    const admin = getAdminClientSafe();
    if (admin) {
      const { data: clientRow } = await admin
        .from("clients")
        .select("company_name")
        .eq("id", (body.client_id as string) ?? "")
        .single();
      updates.client_name = (clientRow as { company_name?: string | null } | null)?.company_name ?? null;
    }
  }

  const writeClient = isClientViewer && admin ? admin : supabase;

  const { data: campaign, error } = await writeClient
    .from("campaigns")
    .update(updates as never)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (body.metrics) {
    await upsertCampaignMetrics(writeClient, id, body.metrics as Record<string, unknown>);
  }

  if (
    "sponsor_name" in body ||
    "total_leads_allocated" in body ||
    "total_campaign_spend" in body ||
    "total_leads_delivered" in body ||
    "daily_reporting" in body ||
    "channel_split" in body ||
    "deficit_leads" in body ||
    "lead_increment" in body ||
    "lead_replace" in body
  ) {
    const historyPayload = {
      date: (body.metric_date as string | null) ?? undefined,
      total_leads_delivered: (body.total_leads_delivered as number | null) ?? 0,
      channel_split: (body.channel_split as Record<string, unknown> | null) ?? {},
      deficit_leads: (body.deficit_leads as number | null) ?? 0,
      lead_increment: (body.lead_increment as number | null) ?? 0,
      lead_replace: (body.lead_replace as number | null) ?? 0,
      total_campaign_spend: (body.total_campaign_spend as number | null) ?? 0,
      updated_by: user.id,
    };
    await upsertCampaignMetrics(writeClient, id, {
      sponsor_name: (body.sponsor_name as string | null) ?? null,
      total_leads_allocated: (body.total_leads_allocated as number | null) ?? 0,
      total_campaign_spend: (body.total_campaign_spend as number | null) ?? 0,
      total_leads_delivered: (body.total_leads_delivered as number | null) ?? 0,
      daily_reporting: (body.daily_reporting as Record<string, unknown> | null) ?? {},
      channel_split: (body.channel_split as Record<string, unknown> | null) ?? {},
      deficit_leads: (body.deficit_leads as number | null) ?? 0,
      lead_increment: (body.lead_increment as number | null) ?? 0,
      lead_replace: (body.lead_replace as number | null) ?? 0,
    });
    await appendCampaignMetricsHistory(writeClient, id, historyPayload);
  }

  const rawLeads = Array.isArray(body.leads) ? (body.leads as Record<string, unknown>[]) : [];
  if (rawLeads.length > COMMAND_CAMPAIGN_LEAD_IMPORT_MAX) {
    return NextResponse.json(
      { error: `Maximum ${COMMAND_CAMPAIGN_LEAD_IMPORT_MAX} leads per import` },
      { status: 400 }
    );
  }
  if (rawLeads.length > 0) {
    const leadPayloads = parsedRowsToLeadInserts(rawLeads, {
      organizationId: profile?.organization_id ?? "",
      campaignId: id,
      createdBy: user.id,
    });
    if (leadPayloads.length > 0) {
      const { error: insertLeadsError } = await writeClient.from("leads").insert(leadPayloads as never);
      if (insertLeadsError) {
        return NextResponse.json({ error: insertLeadsError.message }, { status: 500 });
      }
    }
  }

  const camp = campaign as { id: string; name: string | null; status?: string | null };
  const campName = String(camp.name ?? "campaign");
  const orgId = (profile?.organization_id ?? "") as string;
  const changedFields = Object.keys(updates);

  void createCampaignLog(writeClient, {
    campaign_id: id,
    action: "campaign_updated",
    message: "Campaign details updated",
    created_by: user.id,
  });

  const statusChanged = typeof updates.status === "string";
  if (statusChanged) {
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(userRoles),
      category: "campaigns",
      eventType: "campaign_status_changed",
      description: `Changed campaign status to ${String(updates.status)}`,
      targetType: "campaign",
      targetId: id,
      targetLabel: campName,
      metadata: {
        new_status: updates.status,
        source: isClientViewer ? "command_client_viewer" : "command_campaigns",
        changed_fields: changedFields,
      },
      request,
    });
  }
  const nonStatusFields = changedFields.filter((f) => f !== "status");
  if (nonStatusFields.length > 0 || rawLeads.length > 0 || Boolean(body.metrics)) {
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(userRoles),
      category: "campaigns",
      eventType: "campaign_updated",
      description: `Updated campaign (${[...nonStatusFields, rawLeads.length > 0 ? "leads" : null, body.metrics ? "metrics" : null].filter(Boolean).join(", ") || "fields"})`,
      targetType: "campaign",
      targetId: id,
      targetLabel: campName,
      metadata: {
        changed_fields: nonStatusFields,
        leads_imported: rawLeads.length,
        metrics_updated: Boolean(body.metrics),
        source: isClientViewer ? "command_client_viewer" : "command_campaigns",
      },
      request,
    });
  }

  return NextResponse.json({ campaign });
}
