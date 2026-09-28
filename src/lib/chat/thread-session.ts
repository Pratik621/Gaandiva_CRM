import type { AdminClient } from "@/lib/supabase/admin";

const SESSION_HOURS = Number(process.env.WHATSAPP_SESSION_HOURS ?? "24") || 24;

/** True if client sent an inbound WhatsApp message within the session window. */
export async function threadHasActiveWhatsAppSession(
  admin: AdminClient,
  threadId: string
): Promise<boolean> {
  const since = new Date(Date.now() - SESSION_HOURS * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("messages")
    .select("id")
    .eq("thread_id", threadId)
    .eq("direction", "inbound")
    .gte("created_at", since)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}
