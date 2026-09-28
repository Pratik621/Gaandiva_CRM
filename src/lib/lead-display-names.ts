import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { getAdminClientSafe } from "@/lib/supabase/admin";

export type LeadIdentity = {
  created_by?: string | null;
  assigned_agent_id?: string | null;
  lead_id?: string | null;
  /** DB snapshot; survives agent user deletion */
  creator_display_name?: string | null;
};

function pickLeadIdentity(row: Record<string, unknown>): LeadIdentity {
  return {
    created_by: typeof row.created_by === "string" ? row.created_by : null,
    assigned_agent_id:
      typeof row.assigned_agent_id === "string" ? row.assigned_agent_id : null,
    lead_id: typeof row.lead_id === "string" ? row.lead_id : null,
    creator_display_name:
      typeof row.creator_display_name === "string" ? row.creator_display_name : null,
  };
}

/** Middle segment of LD-{AgentToken}-{Year}-{Seq} */
export function agentTokenFromLeadId(leadId: string | null | undefined): string | null {
  if (!leadId?.trim()) return null;
  const match = /^LD-([^-]+)-\d{4}-/i.exec(leadId.trim());
  return match?.[1]?.toUpperCase() ?? null;
}

function userIdForLeadToken(
  token: string,
  users: { id: string; agent_code: string | null }[]
): string | null {
  const t = token.toUpperCase();
  for (const u of users) {
    const compact = u.id.replace(/-/g, "").toUpperCase();
    const code = u.agent_code?.trim().toUpperCase();
    if (code && code === t) return u.id;
    if (`A${compact.slice(0, 6)}` === t) return u.id;
    if (compact.slice(0, 7) === t) return u.id;
  }
  return null;
}

/** Load display names for creators / agents; resolves missing FKs via lead_id token when possible. */
export async function resolveLeadUserNames(
  supabase: SupabaseClient,
  leads: Record<string, unknown>[],
  organizationId?: string | null
): Promise<Record<string, string>> {
  const identities = leads.map(pickLeadIdentity);
  const userIds = new Set<string>();
  for (const l of identities) {
    if (l.created_by) userIds.add(l.created_by);
    if (l.assigned_agent_id) userIds.add(l.assigned_agent_id);
  }
  for (const row of leads) {
    const qaAuditorId =
      typeof row.qa_audited_by_id === "string" ? row.qa_audited_by_id : null;
    if (qaAuditorId) userIds.add(qaAuditorId);
    const deliveredById = typeof row.delivered_by === "string" ? row.delivered_by : null;
    if (deliveredById) userIds.add(deliveredById);
  }

  const tokensNeedingLookup = new Set<string>();
  for (const l of identities) {
    if (l.created_by || l.assigned_agent_id) continue;
    const snap = (l.creator_display_name ?? "").trim();
    if (snap) continue;
    const token = agentTokenFromLeadId(l.lead_id);
    if (token) tokensNeedingLookup.add(token);
  }

  if (tokensNeedingLookup.size > 0 && organizationId) {
    const admin = getAdminClientSafe() ?? supabase;
    const { data: orgUsers } = await admin
      .from("users")
      .select("id, agent_code")
      .eq("organization_id", organizationId);
    const rows = (orgUsers ?? []) as { id: string; agent_code: string | null }[];
    for (const token of tokensNeedingLookup) {
      const uid = userIdForLeadToken(token, rows);
      if (uid) userIds.add(uid);
    }
  }

  return resolveUserDisplayNames(supabase, [...userIds]);
}

/**
 * Created By: agent who created/uploaded the lead — never QA name.
 * Order: created_by → assigned_agent_id → persisted snapshot → lead_id token match.
 */
export function leadCreatedByName(
  lead: LeadIdentity,
  userNames: Record<string, string>,
  tokenToUserId?: Record<string, string>
): string | null {
  if (lead.created_by) {
    const creator = userNames[lead.created_by]?.trim();
    if (creator) return creator;
  }
  if (lead.assigned_agent_id) {
    const agent = userNames[lead.assigned_agent_id]?.trim();
    if (agent) return agent;
  }
  const snapshot = (lead.creator_display_name ?? "").trim();
  if (snapshot) return snapshot;

  const token = agentTokenFromLeadId(lead.lead_id);
  if (token && tokenToUserId?.[token]) {
    const fromToken = userNames[tokenToUserId[token]]?.trim();
    if (fromToken) return fromToken;
  }
  return null;
}

/** Map lead_id agent token → user id (for leads missing created_by). */
export async function resolveLeadTokenToUserId(
  supabase: SupabaseClient,
  leads: Record<string, unknown>[],
  organizationId?: string | null
): Promise<Record<string, string>> {
  if (!organizationId) return {};
  const tokens = new Set<string>();
  for (const l of leads.map(pickLeadIdentity)) {
    if (l.created_by || l.assigned_agent_id || (l.creator_display_name ?? "").trim()) continue;
    const token = agentTokenFromLeadId(l.lead_id);
    if (token) tokens.add(token);
  }
  if (tokens.size === 0) return {};

  const admin = getAdminClientSafe() ?? supabase;
  const { data: orgUsers } = await admin
    .from("users")
    .select("id, agent_code")
    .eq("organization_id", organizationId);
  const rows = (orgUsers ?? []) as { id: string; agent_code: string | null }[];
  const out: Record<string, string> = {};
  for (const token of tokens) {
    const uid = userIdForLeadToken(token, rows);
    if (uid) out[token] = uid;
  }
  return out;
}

export function leadQaAuditorName(
  lead: {
    qa_name?: string | null;
    qa_audited_by_id?: string | null;
    qa_status?: string | null;
    created_by?: string | null;
  },
  userNames: Record<string, string>
): string | null {
  const stored = (lead.qa_name ?? "").trim();
  if (stored) return stored;
  const auditorId = lead.qa_audited_by_id;
  if (auditorId) {
    const resolved = userNames[auditorId]?.trim();
    if (resolved) return resolved;
  }
  // Legacy rows: QA outcome recorded on created_by before qa_audited_by_id existed.
  if (String(lead.qa_status ?? "").trim() && lead.created_by) {
    const legacy = userNames[lead.created_by]?.trim();
    if (legacy) return legacy;
  }
  return null;
}

export async function enrichLeadsWithCreatorNames<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  leads: T[],
  organizationId?: string | null
): Promise<
  (T & {
    assigned_agent_name: string | null;
    created_by_name: string | null;
    audit_by_name: string | null;
    delivered_by_name: string | null;
  })[]
> {
  const [userNames, tokenToUserId] = await Promise.all([
    resolveLeadUserNames(supabase, leads, organizationId),
    resolveLeadTokenToUserId(supabase, leads, organizationId),
  ]);
  return leads.map((l) => {
    const id = pickLeadIdentity(l);
    return {
      ...l,
      assigned_agent_name: id.assigned_agent_id
        ? userNames[id.assigned_agent_id] ?? null
        : null,
      created_by_name: leadCreatedByName(id, userNames, tokenToUserId),
      audit_by_name: leadQaAuditorName(
        {
          qa_name: typeof l.qa_name === "string" ? l.qa_name : null,
          qa_audited_by_id:
            typeof l.qa_audited_by_id === "string" ? l.qa_audited_by_id : null,
          qa_status: typeof l.qa_status === "string" ? l.qa_status : null,
          created_by: typeof l.created_by === "string" ? l.created_by : null,
        },
        userNames
      ),
      delivered_by_name:
        typeof l.delivered_by === "string" && l.delivered_by
          ? userNames[l.delivered_by] ?? null
          : null,
    };
  });
}
