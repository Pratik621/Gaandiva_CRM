import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasOrgWideCampaignAccess } from "@/lib/auth/tl-access";
import { canAssignCampaignSTL } from "@/lib/auth/stl-access";
import { createNotification } from "@/lib/notifications";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { enrichLeadsWithCreatorNames } from "@/lib/lead-display-names";
import {
  campaignQuestionsToDbValue,
  normalizeCampaignQuestions,
} from "@/lib/campaign-questions";
import {
  fetchCampaignSTLAssignments,
  formatSTLAssignmentLabel,
  isUserAssignedToCampaignAsSTL,
  normalizeSTLAssignments,
  syncCampaignSTLAssignments,
} from "@/lib/campaign/stl-assignments";
import { fetchCampaignTeamLeaderAssignments } from "@/lib/campaign/team-leader-assignments";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  enrichCampaignAllocationFields,
  MIS_DELIVERED_ACHIEVED_OPTIONS,
} from "@/lib/campaign-allocation";
import { aggregateTlLeadCountsByCampaign } from "@/lib/tl/dashboard-leads";
import {
  fetchAllTlLeadsForCampaigns,
  fetchTlLeadsPageForCampaigns,
  TL_LEADS_LIST_SELECT,
} from "@/lib/tl/leads-list";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, campaign_id, campaign_code, client_id, name, client_name, description, industry, geography, target_designation, lead_type, status, start_date, end_date, cpl, revenue, booked, total_allocation, post_qa, achieved, pending_allocation, weekly_call, weekly_report, additional_comments, assigned_stl_id, assigned_team_leader_id, employee_size, abm, seniority, job_function, creatives_url, lead_aggregated, campaign_questions, created_at")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const camp = campaign as { assigned_stl_id?: string | null; [k: string]: unknown };
    const stlAssigned = await isUserAssignedToCampaignAsSTL(
      supabase,
      campaignId,
      user.id,
      camp.assigned_stl_id ?? null
    );
    if (!hasOrgWideCampaignAccess(roleNames) && !stlAssigned) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let stl_assignments = await fetchCampaignSTLAssignments(
      supabase,
      campaignId,
      camp.assigned_stl_id ?? null
    );
    const legacyStlId = camp.assigned_stl_id ?? null;
    if (legacyStlId && !stl_assignments.some((a) => a.stl_id === legacyStlId)) {
      const legacyNames = await resolveUserDisplayNames(supabase, [legacyStlId]);
      stl_assignments = [
        ...stl_assignments,
        {
          stl_id: legacyStlId,
          stl_name: legacyNames[legacyStlId] ?? null,
        },
      ];
    }
    stl_assignments = normalizeSTLAssignments(stl_assignments, {
      assigned_stl_id: legacyStlId,
    });
    const assigned_stl_name = formatSTLAssignmentLabel(stl_assignments);

    // Additive: which actual Team Leader(s) this campaign is currently delegated to
    // (if any) — lets the STL's own "Delegate to Team Leader" picker show which of
    // her Team Leaders are already on this campaign.
    const team_leader_assignments = await fetchCampaignTeamLeaderAssignments(
      supabase,
      campaignId,
      (camp as { assigned_team_leader_id?: string | null }).assigned_team_leader_id ?? null
    );

    const campaignWithStlName = {
      ...(campaign as Record<string, unknown>),
      assigned_stl_name,
      stl_assignments,
      team_leader_assignments,
    };

    const sp = new URL(request.url).searchParams;
    const exportAll = sp.get("export") === "all";
    const searchRaw = sp.get("q")?.trim() || "";
    const dateFrom = sp.get("date_from")?.trim() || undefined;
    const dateTo = sp.get("date_to")?.trim() || undefined;
    const { page: leadsPage, limit: leadsLimit, offset: leadsOffset } = parseListPagination(sp);

    let leadsList: Record<string, unknown>[] = [];
    let leadsTotal = 0;

    const [leadsFetchRes, assignmentsRes, filesRes] = await Promise.all([
      exportAll
        ? fetchAllTlLeadsForCampaigns(supabase, {
            campaignIds: [campaignId],
            search: searchRaw || undefined,
            dateFrom,
            dateTo,
            select: TL_LEADS_LIST_SELECT,
          }).then(({ rows, total }) => ({ rows, total, error: null as { message: string } | null }))
        : fetchTlLeadsPageForCampaigns(supabase, {
            campaignIds: [campaignId],
            offset: leadsOffset,
            limit: leadsLimit,
            search: searchRaw || undefined,
            dateFrom,
            dateTo,
            select: TL_LEADS_LIST_SELECT,
          }).then(({ rows, total }) => ({ rows, total, error: null as { message: string } | null }))
            .catch((err: Error) => ({
              rows: [] as Record<string, unknown>[],
              total: 0,
              error: { message: err.message },
            })),
      supabase
        .from("campaign_assignments")
        .select("id, agent_id, assigned_by, assigned_at, is_active")
        .eq("campaign_id", campaignId)
        .eq("is_active", true),
      supabase
        .from("campaign_files")
        .select("id, file_name, file_path, file_size, mime_type, created_at")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
    ]);

    if (leadsFetchRes.error) {
      return NextResponse.json({ error: leadsFetchRes.error.message }, { status: 500 });
    }
    leadsList = leadsFetchRes.rows;
    leadsTotal = leadsFetchRes.total;

    if (assignmentsRes.error) {
      return NextResponse.json({ error: assignmentsRes.error.message }, { status: 500 });
    }
    const fileRows = filesRes.error ? [] : (filesRes.data ?? []);

    type AssignmentRow = { id: string; agent_id: string; assigned_by: string | null; assigned_at: string; is_active: boolean };
    const assignments = (assignmentsRes.data ?? []) as AssignmentRow[];
    const agentIds = [...new Set(assignments.map((a) => a.agent_id))];
    let agentNames: Record<string, string> = {};
    if (agentIds.length > 0) {
      const { data: agentUsers } = await supabase
        .from("users")
        .select("id, full_name, email")
        .in("id", agentIds);
      ((agentUsers ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach((u) => {
        agentNames[u.id] = u.full_name || u.email || "Unknown";
      });
    }

    const assignmentsWithNames = assignments.map((a) => ({
      ...a,
      agent_name: agentNames[a.agent_id] || "Unknown",
    }));

    const leadsWithRecordings = await enrichLeadsWithCreatorNames(supabase, leadsList, orgId);

    type FileRow = { id: string; file_name: string; file_path: string; file_size: number | null; mime_type: string | null; created_at: string };
    const files = fileRows as FileRow[];
    const filesWithUrls = await Promise.all(
      files.map(async (f) => {
        const { data: signed } = await supabase.storage.from("campaign-files").createSignedUrl(f.file_path, 3600);
        return {
          id: f.id,
          file_name: f.file_name,
          file_path: f.file_path,
          file_size: f.file_size,
          mime_type: f.mime_type,
          created_at: f.created_at,
          download_url: signed?.signedUrl ?? null,
        };
      })
    );

    const leadCounts = await aggregateTlLeadCountsByCampaign(supabase, orgId, [campaignId]);
    const metrics = leadCounts[campaignId] ?? { total: 0, qualified: 0, disqualified: 0, delivered: 0 };
    const campaignWithAllocation = enrichCampaignAllocationFields(
      campaignWithStlName,
      metrics,
      MIS_DELIVERED_ACHIEVED_OPTIONS
    );

    if (exportAll) {
      const exportRoleNames = await fetchUserRoleNames(supabase, user.id);
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: resolvePrimaryAuditRole(exportRoleNames),
        category: "exports",
        eventType: "lead_export",
        description: `Exported ${leadsTotal.toLocaleString()} leads (campaign detail)`,
        targetType: "campaign",
        targetId: campaignId,
        targetLabel: String(camp.name ?? campaignId),
        metadata: {
          row_count: leadsTotal,
          source: "stl_campaign_detail",
          search: searchRaw || null,
          date_from: dateFrom ?? null,
          date_to: dateTo ?? null,
        },
        request,
      });
    }

    return NextResponse.json({
      campaign: campaignWithAllocation,
      leads: leadsWithRecordings,
      leads_pagination: buildPaginationMeta(
        exportAll ? 1 : leadsPage,
        exportAll ? Math.max(leadsTotal, 1) : leadsLimit,
        leadsTotal
      ),
      assignments: assignmentsWithNames,
      files: filesWithUrls,
    });
  } catch (err) {
    console.error("Fetch STL campaign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const canAssignStl = canAssignCampaignSTL(roleNames);

    const { data: existingCampaign, error: existingError } = await supabase
      .from("campaigns")
      .select("id, name, status, assigned_stl_id")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (existingError || !existingCampaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const existing = existingCampaign as {
      id: string;
      name: string;
      status: string;
      assigned_stl_id: string | null;
    };

    if (
      !hasOrgWideCampaignAccess(roleNames) &&
      existing.assigned_stl_id !== user.id
    ) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      client_name,
      description,
      industry,
      geography,
      target_designation,
      lead_type,
      start_date,
      end_date,
      status,
      cpl,
      revenue,
      booked,
      total_allocation,
      post_qa,
      weekly_call,
      weekly_report,
      additional_comments,
      assigned_stl_id,
      employee_size,
      abm,
      seniority,
      job_function,
      creatives_url,
      lead_aggregated,
      campaign_questions,
    } = body;

    const updates: Record<string, unknown> = {};
    if (typeof name === "string") updates.name = name.trim();
    if (client_name !== undefined) updates.client_name = client_name?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (industry !== undefined) updates.industry = industry?.trim() || null;
    if (geography !== undefined) updates.geography = geography?.trim() || null;
    if (target_designation !== undefined) updates.target_designation = target_designation?.trim() || null;
    if (lead_type !== undefined) {
      const leadTypeStr =
        Array.isArray(lead_type) && lead_type.length
          ? lead_type
              .map((v: unknown) => (typeof v === "string" ? v.trim() : String(v).trim()))
              .filter(Boolean)
              .join(", ")
          : typeof lead_type === "string"
          ? lead_type.trim() || null
          : null;
      updates.lead_type = leadTypeStr;
    }
    if (start_date !== undefined) updates.start_date = start_date || null;
    if (end_date !== undefined) updates.end_date = end_date || null;
    if (typeof status === "string" && ["draft", "active", "paused", "completed"].includes(status)) {
      updates.status = status;
    }
    if (cpl !== undefined) updates.cpl = cpl != null ? Number(cpl) : null;
    if (revenue !== undefined) updates.revenue = revenue != null ? Number(revenue) : null;
    if (booked !== undefined) updates.booked = booked != null ? Number(booked) : null;
    if (total_allocation !== undefined) updates.total_allocation = total_allocation != null ? Number(total_allocation) : null;
    if (post_qa !== undefined) updates.post_qa = post_qa != null ? Number(post_qa) : null;
    if (weekly_call !== undefined) updates.weekly_call = weekly_call?.trim() || null;
    if (weekly_report !== undefined) updates.weekly_report = weekly_report?.trim() || null;
    if (additional_comments !== undefined) updates.additional_comments = additional_comments?.trim() || null;
    if (assigned_stl_id !== undefined) {
      const newStlId = assigned_stl_id || null;
      const currentStlId = existing.assigned_stl_id ?? null;

      if (!canAssignStl) {
        if (newStlId !== currentStlId) {
          return NextResponse.json(
            {
              error: "You do not have permission to assign Senior Team Leaders. Contact Operations Manager.",
            },
            { status: 403 }
          );
        }
      } else if (newStlId !== currentStlId) {
        const { error: syncError } = await syncCampaignSTLAssignments(supabase, {
          organizationId: orgId,
          campaignId,
          stlIds: newStlId ? [newStlId] : [],
          assignedBy: user.id,
        });
        if (syncError) {
          return NextResponse.json({ error: syncError }, { status: 500 });
        }
        updates.assigned_stl_id = newStlId;
      }
    }
    if (employee_size !== undefined) updates.employee_size = Array.isArray(employee_size) && employee_size.length > 0 ? employee_size.filter((v) => v && typeof v === "string").map((v) => String(v).trim()) : null;
    if (abm !== undefined) updates.abm = abm === true || abm === "true" || abm === "yes" ? true : abm === false || abm === "false" || abm === "no" ? false : null;
    if (seniority !== undefined) updates.seniority = seniority != null && typeof seniority === "string" ? seniority.trim() || null : null;
    if (job_function !== undefined) updates.job_function = job_function != null && typeof job_function === "string" ? job_function.trim() || null : null;
    if (creatives_url !== undefined) updates.creatives_url = Array.isArray(creatives_url) && creatives_url.length > 0 ? creatives_url.filter((v) => v && typeof v === "string").map((v) => String(v).trim()).filter(Boolean) : null;
    if (lead_aggregated !== undefined) updates.lead_aggregated = lead_aggregated != null && typeof lead_aggregated === "string" ? lead_aggregated.trim() || null : null;
    if (campaign_questions !== undefined) {
      updates.campaign_questions = campaignQuestionsToDbValue(
        normalizeCampaignQuestions(campaign_questions)
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: campaign, error: updateError } = await supabase
      .from("campaigns")
      .update(updates as never)
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const updated = campaign as {
      id: string;
      name?: string;
      assigned_stl_id?: string | null;
      [k: string]: unknown;
    };
    const stl_assignments = await fetchCampaignSTLAssignments(
      supabase,
      campaignId,
      updated.assigned_stl_id ?? null
    );
    const assigned_stl_name = formatSTLAssignmentLabel(stl_assignments);

    const newStlId = updated.assigned_stl_id ?? null;
    if (canAssignStl && newStlId && newStlId !== existing.assigned_stl_id && newStlId !== user.id) {
      void createNotification({
        title: "Campaign Assigned",
        message: `Campaign "${String(updated.name ?? existing.name)}" has been assigned to you.`,
        type: "campaign",
        sender_id: user.id,
        receiver_id: newStlId,
        reference_type: "campaign",
        reference_id: updated.id,
        organization_id: orgId,
      });
    }

    const auditRole = resolvePrimaryAuditRole(roleNames);
    const campaignLabel = String(updated.name ?? existing.name);
    const changedFields = Object.keys(updates);
    const statusChanged =
      typeof updates.status === "string" && updates.status !== existing.status;
    if (statusChanged) {
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: auditRole,
        category: "campaigns",
        eventType: "campaign_status_changed",
        description: `Changed campaign status from ${existing.status} to ${updates.status}`,
        targetType: "campaign",
        targetId: campaignId,
        targetLabel: campaignLabel,
        metadata: {
          previous_status: existing.status,
          new_status: updates.status,
          source: "stl_campaigns",
          changed_fields: changedFields,
        },
        request,
      });
    }
    const nonStatusFields = changedFields.filter((f) => f !== "status");
    if (nonStatusFields.length > 0) {
      void logAudit({
        organizationId: orgId,
        actorId: user.id,
        actorRole: auditRole,
        category: "campaigns",
        eventType: "campaign_updated",
        description: `Updated campaign (${nonStatusFields.join(", ")})`,
        targetType: "campaign",
        targetId: campaignId,
        targetLabel: campaignLabel,
        metadata: { changed_fields: nonStatusFields, source: "stl_campaigns" },
        request,
      });
    }

    return NextResponse.json({
      campaign: { ...updated, assigned_stl_name, stl_assignments },
    });
  } catch (err) {
    console.error("Update STL campaign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

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

    const { data: existing, error: fetchError } = await supabase
      .from("campaigns")
      .select("id, name, campaign_id, campaign_code, status, client_name")
      .eq("id", campaignId)
      .eq("organization_id", orgId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const camp = existing as {
      id: string;
      name: string;
      campaign_id: string | null;
      campaign_code: string | null;
      status: string | null;
      client_name: string | null;
    };

    const { error: deleteError } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", campaignId)
      .eq("organization_id", orgId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_deleted",
      description: `Deleted campaign "${camp.name}"`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: camp.name,
      metadata: {
        campaign_display_id: camp.campaign_id,
        campaign_code: camp.campaign_code,
        status: camp.status,
        client_name: camp.client_name,
        source: "stl_campaigns",
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Delete STL campaign error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
