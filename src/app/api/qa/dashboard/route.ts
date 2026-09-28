import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { fetchScoredLeadsForCampaigns } from "@/lib/qa-campaigns-data";
import {
  countAuditedLeads,
  countDisqualifiedLeads,
  countPendingAuditLeads,
  countQualifiedLeads,
} from "@/lib/qa-lead-audit";

export const dynamic = "force-dynamic";

type AuditLead = {
  id: string;
  campaign_id: string;
  qa_status: string | null;
  created_at: string;
  updated_at: string;
  qa_audited_at: string | null;
  audit_date: string | null;
};

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
    const canView = roleNames.includes("qa") || roleNames.includes("admin");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden: QA or Admin role required" }, { status: 403 });
    }

    // Bypass heavy multi-policy RLS after role check (same pattern as MIS dashboard).
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: campaigns, error: campaignsError } = await admin
      .from("campaigns")
      .select(`
        id, campaign_id, campaign_code, name, client_name, description, industry, geography, target_designation, lead_type, status,
        start_date, end_date, created_at, cpl, revenue, booked, total_allocation, post_qa, achieved, pending_allocation,
        weekly_call, weekly_report, additional_comments, assigned_team_leader_id,
        employee_size, revenue_size, abm, seniority, job_function, creatives_url
      `)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (campaignsError) {
      return NextResponse.json({ error: campaignsError.message }, { status: 500 });
    }

    const campaignsList = (campaigns ?? []) as {
      id: string;
      campaign_id: string;
      name: string;
      client_name: string | null;
      description: string | null;
      industry: string | null;
      geography: string | null;
      target_designation: string | null;
      lead_type: string | null;
      status: string;
      start_date: string | null;
      end_date: string | null;
      created_at: string;
      cpl: number | null;
      revenue: number | null;
      booked: number | null;
      total_allocation: number | null;
      post_qa: number | null;
      achieved: number | null;
      pending_allocation: number | null;
      weekly_call: string | null;
      weekly_report: string | null;
      additional_comments: string | null;
      assigned_team_leader_id: string | null;
      employee_size: string[] | null;
      abm: boolean | null;
      seniority: string | null;
      job_function: string | null;
      creatives_url: string[] | null;
      campaign_code?: string | null;
    }[];

    const tlIds = [
      ...new Set(campaignsList.map((c) => c.assigned_team_leader_id).filter(Boolean)),
    ] as string[];
    const tlNames: Record<string, string> = {};
    if (tlIds.length > 0) {
      const { data: tlUsers } = await admin.from("users").select("id, full_name, email").in("id", tlIds);
      ((tlUsers ?? []) as { id: string; full_name: string | null; email: string | null }[]).forEach(
        (u) => {
          tlNames[u.id] = u.full_name || u.email || "Unknown";
        }
      );
    }

    const campaignsWithTlName = campaignsList.map((c) => ({
      ...c,
      assigned_team_leader_name: c.assigned_team_leader_id
        ? tlNames[c.assigned_team_leader_id] ?? null
        : null,
    }));
    const campaignIds = campaignsList.map((c) => c.id);

    if (campaignIds.length === 0) {
      return NextResponse.json({
        campaigns: campaignsWithTlName.map((c) => ({ ...c, leads: [] })),
        summary: {
          total_leads: 0,
          total_audited: 0,
          pending_audit: 0,
          total_qualified: 0,
          total_disqualified: 0,
        },
      });
    }

    // Audit columns only — dashboard never needs full lead payloads (~80 cols).
    const rawLeads = (await fetchScoredLeadsForCampaigns(
      admin,
      orgId,
      campaignIds,
      undefined,
      "audit"
    )) as AuditLead[];

    const lastLeadActivityMs: Record<string, number> = {};
    const leadsByCampaign: Record<string, AuditLead[]> = {};
    for (const c of campaignsWithTlName) {
      leadsByCampaign[c.id] = [];
    }
    for (const row of rawLeads) {
      const createdMs = new Date(row.created_at).getTime();
      const updatedMs = new Date(row.updated_at).getTime();
      const activityMs = Math.max(
        Number.isFinite(createdMs) ? createdMs : 0,
        Number.isFinite(updatedMs) ? updatedMs : 0
      );
      if (activityMs) {
        const prev = lastLeadActivityMs[row.campaign_id] ?? 0;
        if (activityMs > prev) lastLeadActivityMs[row.campaign_id] = activityMs;
      }
      if (leadsByCampaign[row.campaign_id]) {
        leadsByCampaign[row.campaign_id].push(row);
      }
    }

    const campaignsWithLeads = campaignsWithTlName
      .map((c) => {
        const activityMs = lastLeadActivityMs[c.id] ?? 0;
        return {
          ...c,
          leads: leadsByCampaign[c.id] ?? [],
          last_lead_activity_at: activityMs > 0 ? new Date(activityMs).toISOString() : null,
        };
      })
      .sort((a, b) => {
        const aMs = lastLeadActivityMs[a.id] ?? 0;
        const bMs = lastLeadActivityMs[b.id] ?? 0;
        if (bMs !== aMs) return bMs - aMs;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    const summary = {
      total_leads: rawLeads.length,
      total_audited: countAuditedLeads(rawLeads),
      pending_audit: countPendingAuditLeads(rawLeads),
      total_qualified: countQualifiedLeads(rawLeads),
      total_disqualified: countDisqualifiedLeads(rawLeads),
    };

    return NextResponse.json({ campaigns: campaignsWithLeads, summary });
  } catch (err) {
    console.error("QA dashboard error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
