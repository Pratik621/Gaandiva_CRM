import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createNotifications } from "@/lib/notifications";
import { normalizeRoleName } from "@/lib/auth/config";

type AnyClient = SupabaseClient<Database>;

async function listOrgAdminIds(
  client: AnyClient,
  organizationId: string
): Promise<Array<{ id: string; full_name: string | null }>> {
  const { data: users } = await client
    .from("users")
    .select("id, full_name, status")
    .eq("organization_id", organizationId)
    .neq("status", "inactive");

  const orgUsers = (users ?? []) as Array<{
    id: string;
    full_name: string | null;
    status: string;
  }>;
  if (orgUsers.length === 0) return [];

  const userIds = orgUsers.map((u) => u.id);
  const { data: roleRows } = await client
    .from("user_roles")
    .select("user_id, roles(name)")
    .in("user_id", userIds);

  const adminIds = new Set<string>();
  for (const row of roleRows ?? []) {
    const r = row as { user_id: string; roles: { name: string } | null };
    if (normalizeRoleName(r.roles?.name) === "admin") {
      adminIds.add(r.user_id);
    }
  }

  return orgUsers
    .filter((u) => adminIds.has(u.id))
    .map((u) => ({ id: u.id, full_name: u.full_name }));
}

export async function notifyAdminsOfDeviceRequest(
  client: AnyClient,
  args: {
    organizationId: string;
    requesterId: string;
    requesterName: string;
    requesterRole: string;
    deviceId: string;
    deviceLabel: string;
  }
): Promise<string[]> {
  const admins = await listOrgAdminIds(client, args.organizationId);
  const receivers = admins.filter((a) => a.id !== args.requesterId);
  if (receivers.length === 0) return [];

  const roleLabel = args.requesterRole
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  await createNotifications(
    receivers.map((admin) => ({
      title: "New device access request",
      message: `${args.requesterName} (${roleLabel}) requested access from a new device (${args.deviceLabel})`,
      type: "system" as const,
      sender_id: args.requesterId,
      receiver_id: admin.id,
      reference_type: "device_request" as const,
      reference_id: args.deviceId,
      organization_id: args.organizationId,
    }))
  );

  return receivers.map((a) => a.full_name?.trim() || "Admin");
}

export async function notifyUserOfDeviceDecision(args: {
  organizationId: string;
  userId: string;
  adminId: string;
  deviceId: string;
  approved: boolean;
  deviceLabel: string;
}): Promise<void> {
  await createNotifications([
    {
      title: args.approved ? "Device approved" : "Device request declined",
      message: args.approved
        ? `Your device "${args.deviceLabel}" was approved. You can continue using the app.`
        : `Your device request for "${args.deviceLabel}" was declined. Contact your admin.`,
      type: "system",
      sender_id: args.adminId,
      receiver_id: args.userId,
      reference_type: "device_request",
      reference_id: args.deviceId,
      organization_id: args.organizationId,
    },
  ]);
}

export async function getAdminDisplayNames(
  client: AnyClient,
  organizationId: string,
  excludeUserId?: string
): Promise<string[]> {
  const admins = await listOrgAdminIds(client, organizationId);
  return admins
    .filter((a) => a.id !== excludeUserId)
    .map((a) => a.full_name?.trim() || "Admin");
}
