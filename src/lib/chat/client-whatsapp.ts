import type { AdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppRecipient } from "@/lib/chat/whatsapp-phone";

/**
 * Ensures `client_contacts` has a row for chat send.
 * Uses `clients.contact_mobile` when no linked row exists (Sales → Clients Mobile field).
 */
export async function ensureClientWhatsAppLinked(
  admin: AdminClient,
  clientId: string,
  contactMobile?: string | null
): Promise<boolean> {
  let mobile = contactMobile ?? null;
  if (!mobile?.trim()) {
    const { data: client } = await admin
      .from("clients")
      .select("contact_mobile")
      .eq("id", clientId)
      .maybeSingle();
    mobile = (client as { contact_mobile: string | null } | null)?.contact_mobile ?? null;
  }

  const waNumber = normalizeWhatsAppRecipient(mobile);
  if (!waNumber) return false;

  const { error } = await admin.from("client_contacts").upsert(
    { client_id: clientId, wa_number: waNumber } as never,
    { onConflict: "client_id" }
  );

  return !error;
}
