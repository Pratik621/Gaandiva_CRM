import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { logAuthEvent, getRequestMeta } from "@/lib/mfa/audit";
import type { DeviceAuthEventType } from "@/lib/devices/constants";

type AdminClient = SupabaseClient<Database>;

export async function logDeviceEvent(
  admin: AdminClient,
  args: {
    organizationId: string;
    userId: string | null;
    eventType: DeviceAuthEventType;
    ip?: string | null;
    userAgent?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await logAuthEvent(admin, {
    organizationId: args.organizationId,
    userId: args.userId,
    eventType: args.eventType,
    ip: args.ip,
    userAgent: args.userAgent,
    metadata: args.metadata,
  });
}

export { getRequestMeta };
