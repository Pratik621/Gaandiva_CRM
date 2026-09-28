import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { PRIVILEGED_VOICE_ROLES } from "@/lib/voice-recordings";
export type LeadAccessRecord = {
  id: string;
  campaign_id: string;
  organization_id: string;
};

export function isPrivilegedLeadAssetRole(roleNames: string[]): boolean {
  return roleNames.some((r) => PRIVILEGED_VOICE_ROLES.has(r));
}

type LeadAccessContext = {
  supabase: SupabaseClient;
  admin: SupabaseClient;
  orgId: string;
  userId: string;
  leadId: string;
};

/**
 * Resolve a lead for voice/LHO APIs.
 * Privileged roles (TL, QA, MIS, DC, etc.) use admin to bypass leads RLS.
 * Pure agents must be assigned to the lead's campaign.
 */
export async function getLeadForLeadAssetApi(
  ctx: LeadAccessContext
): Promise<{ lead: LeadAccessRecord } | { error: NextResponse }> {
  const roleNames = await fetchUserRoleNames(ctx.supabase, ctx.userId);
  const isAgent = roleNames.includes("agent");
  const isPrivileged = isPrivilegedLeadAssetRole(roleNames);

  const leadsClient = isPrivileged ? ctx.admin : ctx.supabase;
  let leadQuery = leadsClient
    .from("leads")
    .select("id, campaign_id, organization_id")
    .eq("id", ctx.leadId);

  if (isPrivileged) {
    leadQuery = leadQuery.eq("organization_id", ctx.orgId);
  }

  const { data: lead, error: leadError } = await leadQuery.single();

  if (leadError || !lead) {
    return { error: NextResponse.json({ error: "Lead not found" }, { status: 404 }) };
  }

  const l = lead as LeadAccessRecord;
  if (l.organization_id !== ctx.orgId) {
    return { error: NextResponse.json({ error: "Lead not found" }, { status: 404 }) };
  }

  if (isAgent && !isPrivileged) {
    const { data: assignment } = await ctx.supabase
      .from("campaign_assignments")
      .select("id")
      .eq("campaign_id", l.campaign_id)
      .eq("agent_id", ctx.userId)
      .eq("is_active", true)
      .maybeSingle();

    if (!assignment) {
      return {
        error: NextResponse.json(
          { error: "You are not assigned to this campaign" },
          { status: 403 }
        ),
      };
    }
  }

  return { lead: l };
}
