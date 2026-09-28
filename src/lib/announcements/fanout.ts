import type { AdminClient } from "@/lib/supabase/admin";
import { createNotifications } from "@/lib/notifications";
import type { AnnouncementType } from "@/lib/announcements/types";

const RECIPIENT_INSERT_CHUNK = 500;

/**
 * Materialize the resolved audience into announcement_recipients and, for
 * alerts, push a bell notification per recipient.
 *
 * Phase-2 seam: this function takes plain data, so at higher scale it can be
 * invoked from a queue/worker instead of inline in the POST handler without
 * touching the route.
 */
export async function fanOutAnnouncement(
  admin: AdminClient,
  params: {
    announcement: {
      id: string;
      organization_id: string;
      type: AnnouncementType;
      title: string;
      message: string;
      created_by: string;
    };
    recipientIds: string[];
  }
): Promise<{ error: string | null }> {
  const { announcement, recipientIds } = params;
  if (recipientIds.length === 0) return { error: null };

  const rows = recipientIds.map((userId) => ({
    announcement_id: announcement.id,
    user_id: userId,
    organization_id: announcement.organization_id,
  }));

  for (let i = 0; i < rows.length; i += RECIPIENT_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + RECIPIENT_INSERT_CHUNK);
    const { error } = await admin.from("announcement_recipients").insert(chunk as never);
    if (error) {
      return { error: error.message };
    }
  }

  // Alerts also land in the existing notifications bell (realtime toast +
  // navigation into the announcements inbox).
  if (announcement.type === "alert") {
    await createNotifications(
      recipientIds.map((receiverId) => ({
        title: `Alert: ${announcement.title}`,
        message: announcement.message || announcement.title,
        type: "system" as const,
        sender_id: announcement.created_by,
        receiver_id: receiverId,
        reference_type: "announcement" as const,
        reference_id: announcement.id,
        organization_id: announcement.organization_id,
      }))
    );
  }

  return { error: null };
}
