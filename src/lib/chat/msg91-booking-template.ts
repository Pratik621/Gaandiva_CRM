/**
 * Booking confirmation via MSG91 — separate from CRM free-text chat.
 * updated_confirmation_template requires body_1..body_4 (guest, property, unit, check-in link).
 */

import { normalizeWhatsAppRecipient } from "@/lib/chat/whatsapp-phone";

type BookingFields = {
  guestName: string;
  propertyName: string;
  unitLabel: string;
  checkInLink: string;
};

function getBookingConfig() {
  const authKey = process.env.WHATSAPP_MSG91_AUTH_KEY?.trim();
  const integratedNumber = process.env.WHATSAPP_MSG91_INTEGRATED_NUMBER?.trim();
  const namespace = process.env.WHATSAPP_MSG91_NAMESPACE?.trim();
  const templateName = process.env.WHATSAPP_MSG91_BOOKING_TEMPLATE?.trim();
  if (!authKey || !integratedNumber || !namespace || !templateName) return null;
  return {
    authKey,
    integratedNumber: integratedNumber.replace(/\D/g, ""),
    namespace,
    templateName,
    bulkApiUrl:
      process.env.WHATSAPP_MSG91_API_URL?.trim() ||
      "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
    languageCode: process.env.WHATSAPP_MSG91_LANGUAGE_CODE?.trim() || "en",
    languagePolicy: process.env.WHATSAPP_MSG91_LANGUAGE_POLICY?.trim() || "deterministic",
  };
}

/** Send approved booking confirmation template (not for CRM "Hello" chat). */
export async function sendMsg91BookingConfirmation(
  recipientNumber: string,
  fields: BookingFields
): Promise<{ ok: boolean; error?: string; requestId?: string | null }> {
  const config = getBookingConfig();
  if (!config) {
    return { ok: false, error: "MSG91 booking template not configured" };
  }

  const recipient = normalizeWhatsAppRecipient(recipientNumber);
  if (!recipient) return { ok: false, error: "Invalid recipient number" };

  const payload = {
    integrated_number: config.integratedNumber,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: config.templateName,
        language: { code: config.languageCode, policy: config.languagePolicy },
        namespace: config.namespace,
        to_and_components: [
          {
            to: [recipient],
            components: {
              body_1: { type: "text", value: fields.guestName },
              body_2: { type: "text", value: fields.propertyName },
              body_3: { type: "text", value: fields.unitLabel },
              body_4: { type: "text", value: fields.checkInLink },
            },
          },
        ],
      },
    },
  };

  const res = await fetch(config.bulkApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: config.authKey,
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    json = {};
  }

  if (!res.ok || json.hasError === true) {
    return {
      ok: false,
      error: (json.message as string) ?? (json.errors as string) ?? `MSG91 HTTP ${res.status}`,
    };
  }

  return {
    ok: true,
    requestId: (json.request_id as string) ?? null,
  };
}
