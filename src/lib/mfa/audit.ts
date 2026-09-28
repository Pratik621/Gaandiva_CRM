import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { MfaAuthEventType, MfaChannel } from "@/lib/mfa/constants";

type AdminClient = SupabaseClient<Database>;

export async function logAuthEvent(
  admin: AdminClient,
  args: {
    organizationId: string;
    userId: string | null;
    eventType: MfaAuthEventType;
    channel?: MfaChannel | null;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  const { error } = await admin.from("auth_events").insert({
    organization_id: args.organizationId,
    user_id: args.userId,
    event_type: args.eventType,
    channel: args.channel ?? null,
    ip: args.ip ?? null,
    user_agent: args.userAgent ?? null,
    metadata: (args.metadata ?? null) as never,
  } as never);

  if (error) {
    console.error("[mfa] auth_events insert failed:", error.message);
  }
}

export function getRequestMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? null;
  const userAgent = request.headers.get("user-agent");
  return { ip, userAgent };
}
