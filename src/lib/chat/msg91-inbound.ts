import type { AdminClient } from "@/lib/supabase/admin";
import { normalizeWhatsAppRecipient } from "@/lib/chat/whatsapp-phone";

function extractText(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.text,
    payload.message,
    payload.body,
    (payload.content as Record<string, unknown> | undefined)?.text,
    (payload.payload as Record<string, unknown> | undefined)?.text,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function extractFrom(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.from,
    payload.sender,
    payload.customerNumber,
    payload.customer_number,
    payload.recipient_number,
    payload.wa_number,
    (payload.payload as Record<string, unknown> | undefined)?.from,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.replace(/\D/g, "");
  }
  return null;
}

function extractMessageId(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.message_uuid,
    payload.messageUuid,
    payload.wa_message_id,
    payload.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

async function findClientIdByPhone(admin: AdminClient, fromDigits: string): Promise<string | null> {
  const normalized = normalizeWhatsAppRecipient(fromDigits);
  const variants = new Set<string>();
  if (fromDigits) variants.add(fromDigits);
  if (normalized) variants.add(normalized);
  if (normalized?.startsWith("91") && normalized.length === 12) {
    variants.add(normalized.slice(2));
  }

  const { data: rows } = await admin.from("client_contacts").select("client_id, wa_number");
  for (const row of (rows ?? []) as { client_id: string; wa_number: string }[]) {
    const stored = row.wa_number.replace(/\D/g, "");
    const storedNorm = normalizeWhatsAppRecipient(row.wa_number)?.replace(/\D/g, "") ?? stored;
    for (const v of variants) {
      if (v === stored || v === storedNorm) return row.client_id;
    }
  }
  return null;
}

async function resolveThreadId(
  admin: AdminClient,
  clientId: string,
  campaignIdHint?: string | null
): Promise<string | null> {
  if (campaignIdHint) {
    const { data } = await admin
      .from("chat_threads")
      .select("id")
      .eq("client_id", clientId)
      .eq("campaign_id", campaignIdHint)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }

  const { data: latest } = await admin
    .from("chat_threads")
    .select("id")
    .eq("client_id", clientId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (latest as { id: string } | null)?.id ?? null;
}

export type InboundHandleResult =
  | { ok: true; threadId: string; messageId: string }
  | { ok: false; reason: string };

/**
 * Process MSG91 inbound WhatsApp webhook payload → store inbound message on thread.
 */
export async function handleMsg91InboundWebhook(
  admin: AdminClient,
  body: Record<string, unknown>
): Promise<InboundHandleResult> {
  const text = extractText(body);
  const from = extractFrom(body);
  if (!from) return { ok: false, reason: "missing sender number" };
  if (!text) return { ok: false, reason: "missing message text" };

  const clientId = await findClientIdByPhone(admin, from);
  if (!clientId) {
    return { ok: false, reason: `no client linked for phone ${from.slice(0, 4)}***` };
  }

  const campaignHint =
    (typeof body.campaign_id === "string" ? body.campaign_id : null) ??
    (typeof body.crqid === "string" ? body.crqid : null);

  let threadId = await resolveThreadId(admin, clientId, campaignHint);
  if (!threadId) {
    const { data: camp } = await admin
      .from("campaigns")
      .select("id, organization_id")
      .eq("client_id", clientId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const c = camp as { id: string; organization_id: string } | null;
    if (!c) return { ok: false, reason: "no active campaign/thread for client" };

    const { data: created } = await admin
      .from("chat_threads")
      .insert({
        organization_id: c.organization_id,
        client_id: clientId,
        campaign_id: c.id,
      } as never)
      .select("id")
      .single();

    threadId = (created as { id: string } | null)?.id ?? null;
  }

  if (!threadId) return { ok: false, reason: "could not resolve thread" };

  const waMessageId = extractMessageId(body);

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      direction: "inbound",
      body: text,
      status: "delivered",
      wa_message_id: waMessageId,
    } as never)
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, reason: error?.message ?? "insert failed" };
  }

  await admin
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() } as never)
    .eq("id", threadId);

  return { ok: true, threadId, messageId: (inserted as { id: string }).id };
}
