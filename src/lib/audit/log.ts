import { getAdminClientSafe } from "@/lib/supabase/admin";

export type AuditCategory =
  | "auth"
  | "leads"
  | "campaigns"
  | "users"
  | "permissions"
  | "exports"
  | "clients"
  | "announcements"
  | "lead_finder"
  | "system";

export type AuditInput = {
  organizationId: string;
  actorId: string | null;
  actorRole?: string | null;
  category: AuditCategory;
  eventType: string;
  description: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Pass the incoming Request to capture ip/user-agent automatically. */
  request?: Request | null;
};

function requestMeta(request?: Request | null) {
  if (!request) return { ip: null as string | null, userAgent: null as string | null };
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null,
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * Fire-and-forget audit trail write. NEVER throws and never blocks the
 * calling flow — a failed audit insert must not fail the business action.
 * Call without await (void logAudit({...})) unless ordering matters.
 */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    const admin = getAdminClientSafe();
    if (!admin) return;

    const { ip, userAgent } = requestMeta(input.request);
    const { error } = await admin.from("audit_logs").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      actor_role: input.actorRole ?? null,
      category: input.category,
      event_type: input.eventType,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      target_label: input.targetLabel ?? null,
      description: input.description,
      ip,
      user_agent: userAgent,
      metadata: (input.metadata ?? null) as never,
    } as never);

    if (error) {
      console.error("[audit] insert failed:", error.message);
    }
  } catch (err) {
    console.error("[audit] logAudit threw:", err);
  }
}
