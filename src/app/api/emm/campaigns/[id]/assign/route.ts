import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAdminClientSafe,
  ADMIN_NOT_CONFIGURED_MESSAGE,
  type AdminClient,
} from "@/lib/supabase/admin";
import { createNotifications } from "@/lib/notifications";
import { canAccessEmmArea } from "@/lib/auth/emm-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { logAudit } from "@/lib/audit/log";
import { resolvePrimaryAuditRole } from "@/lib/audit/actor-role";

export const dynamic = "force-dynamic";

type AuthorizedContext = {
  /** Service-role client: `campaigns`/`campaign_assignments` RLS has no EMM
   *  policy, so every query below scopes `organization_id` by hand. */
  db: AdminClient;
  userId: string;
  orgId: string;
  roleNames: string[];
  campaign: { id: string; name: string };
};

/**
 * Email Marketing Manager may assign agents on any campaign inside their own
 * organization, so authorization stops at role + org scope (no per-campaign
 * ownership check like the Team Leader flow).
 */
async function authorize(
  campaignId: string
): Promise<{ context: AuthorizedContext } | { error: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const roleNames = await fetchUserRoleNames(supabase, user.id);
  if (!canAccessEmmArea(roleNames)) {
    return {
      error: NextResponse.json(
        { error: "You do not have permission to assign agents" },
        { status: 403 }
      ),
    };
  }

  if (!campaignId) {
    return { error: NextResponse.json({ error: "Campaign ID required" }, { status: 400 }) };
  }

  const admin = getAdminClientSafe();
  if (!admin) {
    return {
      error: NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 }),
    };
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, name")
    .eq("id", campaignId)
    .eq("organization_id", orgId)
    .single();

  if (!campaign) {
    return { error: NextResponse.json({ error: "Campaign not found" }, { status: 404 }) };
  }

  return {
    context: {
      db: admin,
      userId: user.id,
      orgId,
      roleNames,
      campaign: campaign as { id: string; name: string },
    },
  };
}

/** Assignable agents in the org plus the campaign's current active assignments. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const result = await authorize(campaignId);
    if ("error" in result) return result.error;
    const { db, orgId } = result.context;

    const { data: roles } = await db
      .from("roles")
      .select("id, name")
      .eq("organization_id", orgId);

    const agentRole = ((roles ?? []) as { id: string; name: string | null }[]).find(
      (r) => r.name?.toLowerCase() === "agent"
    );

    const { data: assignmentRows } = await db
      .from("campaign_assignments")
      .select("agent_id")
      .eq("campaign_id", campaignId)
      .eq("is_active", true);

    const assignedIds = ((assignmentRows ?? []) as { agent_id: string }[]).map(
      (row) => row.agent_id
    );

    if (!agentRole) {
      return NextResponse.json({ agents: [], assignments: [] });
    }

    const { data: userRoles } = await db
      .from("user_roles")
      .select("user_id")
      .eq("role_id", agentRole.id);

    const agentIds = ((userRoles ?? []) as { user_id: string }[]).map((ur) => ur.user_id);
    // Names are needed for agents already assigned even if they lost the role.
    const lookupIds = [...new Set([...agentIds, ...assignedIds])];

    if (lookupIds.length === 0) {
      return NextResponse.json({ agents: [], assignments: [] });
    }

    const { data: users } = await db
      .from("users")
      .select("id, full_name, email")
      .eq("organization_id", orgId)
      .in("id", lookupIds);

    const userRows = (users ?? []) as {
      id: string;
      full_name: string | null;
      email: string | null;
    }[];
    const nameById = new Map(userRows.map((u) => [u.id, u.full_name || u.email || null]));
    const agentIdSet = new Set(agentIds);

    return NextResponse.json({
      agents: userRows.filter((u) => agentIdSet.has(u.id)),
      assignments: assignedIds.map((agentId) => ({
        agent_id: agentId,
        agent_name: nameById.get(agentId) ?? null,
      })),
    });
  } catch (err) {
    console.error("EMM assign agents (GET) error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const result = await authorize(campaignId);
    if ("error" in result) return result.error;
    const { db, userId, orgId, roleNames, campaign } = result.context;

    const body = await request.json();
    const rawAgentIds: unknown = body?.agent_ids;
    const agentIds: string[] = Array.isArray(rawAgentIds)
      ? [...new Set(rawAgentIds.filter((v): v is string => typeof v === "string"))]
      : [];

    const { data: existing } = await db
      .from("campaign_assignments")
      .select("agent_id")
      .eq("campaign_id", campaignId);

    const existingIds = new Set(
      ((existing ?? []) as { agent_id: string }[]).map((a) => a.agent_id)
    );
    const nextIds = new Set(agentIds);

    const toInsert = agentIds
      .filter((agentId) => !existingIds.has(agentId))
      .map((agentId) => ({
        organization_id: orgId,
        campaign_id: campaignId,
        agent_id: agentId,
        assigned_by: userId,
      }));

    const toReactivate = agentIds.filter((agentId) => existingIds.has(agentId));
    const toDeactivate = [...existingIds].filter((agentId) => !nextIds.has(agentId));

    if (toReactivate.length > 0) {
      await db
        .from("campaign_assignments")
        .update({ is_active: true, assigned_by: userId } as never)
        .eq("campaign_id", campaignId)
        .in("agent_id", toReactivate);
    }

    if (toDeactivate.length > 0) {
      await db
        .from("campaign_assignments")
        .update({ is_active: false } as never)
        .eq("campaign_id", campaignId)
        .in("agent_id", toDeactivate);
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await db
        .from("campaign_assignments")
        .insert(toInsert as never);

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      void createNotifications(
        toInsert.map((a) => ({
          title: "Campaign Assigned",
          message: `You have been assigned to campaign "${campaign.name}". Check your dashboard for leads.`,
          type: "campaign" as const,
          sender_id: userId,
          receiver_id: a.agent_id,
          reference_type: "campaign" as const,
          reference_id: campaignId,
          organization_id: orgId,
        }))
      );
    }

    void logAudit({
      organizationId: orgId,
      actorId: userId,
      actorRole: resolvePrimaryAuditRole(roleNames),
      category: "campaigns",
      eventType: "campaign_agents_assigned",
      description: `Updated agent assignments on campaign "${campaign.name}" (${agentIds.length} assigned)`,
      targetType: "campaign",
      targetId: campaignId,
      targetLabel: campaign.name,
      metadata: {
        assigned_count: agentIds.length,
        added_count: toInsert.length,
        removed_count: toDeactivate.length,
        agent_ids: agentIds,
        source: "emm_campaign_assign",
      },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("EMM assign agents (POST) error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
