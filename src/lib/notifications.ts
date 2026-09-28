import { getAdminClientSafe } from "@/lib/supabase/admin";

export type NotificationType = "campaign" | "task" | "lead" | "followup" | "system";
export type NotificationReferenceType =
  | "campaign"
  | "lead"
  | "task"
  | "deal"
  | "announcement"
  | "device_request";

export interface CreateNotificationInput {
  title: string;
  message: string;
  type: NotificationType;
  sender_id: string;
  receiver_id: string;
  reference_type?: NotificationReferenceType | null;
  reference_id?: string | null;
  organization_id: string;
}

/**
 * Insert a notification row via the service-role admin client.
 * Silently swallows errors so the calling API route is never blocked.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  const admin = getAdminClientSafe();
  if (!admin) return;

  const { error } = await admin.from("notifications").insert({
    title: input.title,
    message: input.message,
    type: input.type,
    sender_id: input.sender_id,
    receiver_id: input.receiver_id,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    organization_id: input.organization_id,
    is_read: false,
  } as never);

  if (error) {
    console.error("[createNotification] failed:", error.message);
  }
}

/**
 * Bulk-create notifications for multiple receivers at once.
 */
export async function createNotifications(
  inputs: CreateNotificationInput[]
): Promise<void> {
  if (!inputs.length) return;
  const admin = getAdminClientSafe();
  if (!admin) return;

  const rows = inputs.map((input) => ({
    title: input.title,
    message: input.message,
    type: input.type,
    sender_id: input.sender_id,
    receiver_id: input.receiver_id,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    organization_id: input.organization_id,
    is_read: false,
  }));

  const { error } = await admin.from("notifications").insert(rows as never);
  if (error) {
    console.error("[createNotifications] failed:", error.message);
  }
}
