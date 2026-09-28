/**
 * MSG91 WhatsApp outbound (server-only).
 * CRM chat: session text first, then optional CHAT template — not booking template.
 */

import {
  getBlockedPrefixError,
  normalizeWhatsAppRecipient,
} from "@/lib/chat/whatsapp-phone";

export type Msg91SendResult =
  | { ok: true; requestId: string | null; channel: "session" | "template" }
  | { ok: false; error: string; details?: string };

type Msg91Config = {
  authKey: string;
  integratedNumber: string;
  namespace: string;
  languageCode: string;
  languagePolicy: string;
  bulkApiUrl: string;
  sessionApiUrl: string;
  chatTemplateName: string | null;
};

function getConfig(): Msg91Config | null {
  const authKey = process.env.WHATSAPP_MSG91_AUTH_KEY?.trim();
  const integratedNumber = process.env.WHATSAPP_MSG91_INTEGRATED_NUMBER?.trim();
  const namespace = process.env.WHATSAPP_MSG91_NAMESPACE?.trim();
  if (!authKey || !integratedNumber || !namespace) return null;

  const chatTemplateName =
    process.env.WHATSAPP_MSG91_CHAT_TEMPLATE?.trim() ||
    process.env.WHATSAPP_MSG91_TEMPLATE_NAME?.trim() ||
    null;

  return {
    authKey,
    integratedNumber: integratedNumber.replace(/\D/g, ""),
    namespace,
    languageCode: process.env.WHATSAPP_MSG91_LANGUAGE_CODE?.trim() || "en",
    languagePolicy: process.env.WHATSAPP_MSG91_LANGUAGE_POLICY?.trim() || "deterministic",
    bulkApiUrl:
      process.env.WHATSAPP_MSG91_API_URL?.trim() ||
      "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
    sessionApiUrl:
      process.env.WHATSAPP_MSG91_SESSION_API_URL?.trim() ||
      "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/",
    chatTemplateName,
  };
}

function buildTemplateComponents(text: string): Record<string, { type: string; value: string }> {
  const mapJson = process.env.WHATSAPP_MSG91_CHAT_TEMPLATE_COMPONENTS?.trim();
  if (mapJson) {
    try {
      const parsed = JSON.parse(mapJson) as Record<string, string>;
      const out: Record<string, { type: string; value: string }> = {};
      for (const [key, field] of Object.entries(parsed)) {
        out[key] = { type: "text", value: field === "{{message}}" ? text : field };
      }
      return out;
    } catch {
      /* fall through */
    }
  }
  return {
    body_1: { type: "text", value: text },
  };
}

async function parseMsg91Response(
  res: Response
): Promise<{ ok: boolean; requestId: string | null; error?: string; raw?: string }> {
  const raw = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    json = { message: raw };
  }

  const status = String(json.status ?? "").toLowerCase();
  const type = String(json.type ?? "").toLowerCase();
  const hasErrorFlag = json.hasError === true || json.has_error === true;
  const hasError =
    !res.ok || hasErrorFlag || type === "error" || type === "failed" || status === "error" || status === "failed";

  const requestId =
    (json.request_id as string | undefined) ??
    (json.requestId as string | undefined) ??
    ((json.data as Record<string, unknown> | undefined)?.request_id as string | undefined) ??
    null;

  if (hasError) {
    const msg =
      (json.message as string | undefined) ??
      (json.error as string | undefined) ??
      (Array.isArray(json.errors) ? JSON.stringify(json.errors) : undefined) ??
      (typeof json.errors === "string" ? json.errors : undefined) ??
      `MSG91 HTTP ${res.status}`;
    return { ok: false, requestId, error: msg, raw };
  }

  return { ok: true, requestId, raw };
}

/** Free-form text when a 24h WhatsApp session is already open. */
async function sendSessionText(
  config: Msg91Config,
  recipient: string,
  text: string
): Promise<Msg91SendResult> {
  const payload = {
    integrated_number: config.integratedNumber,
    recipient_number: recipient,
    content_type: "text",
    text,
  };

  const res = await fetch(config.sessionApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: config.authKey,
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const parsed = await parseMsg91Response(res);
  if (!parsed.ok) {
    console.warn("[MSG91 session]", parsed.error, parsed.raw?.slice(0, 300));
    return { ok: false, error: parsed.error ?? "Session message failed" };
  }
  return { ok: true, requestId: parsed.requestId, channel: "session" };
}

/** Chat template only — do NOT use booking/confirmation templates for free text. */
async function sendChatTemplate(
  config: Msg91Config,
  recipient: string,
  text: string
): Promise<Msg91SendResult> {
  if (!config.chatTemplateName) {
    return {
      ok: false,
      error:
        "No chat template configured. Set WHATSAPP_MSG91_CHAT_TEMPLATE to a simple 1-variable template, or ask the client to message you first (24h session).",
    };
  }

  const payload = {
    integrated_number: config.integratedNumber,
    content_type: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template: {
        name: config.chatTemplateName,
        language: {
          code: config.languageCode,
          policy: config.languagePolicy,
        },
        namespace: config.namespace,
        to_and_components: [
          {
            to: [recipient],
            components: buildTemplateComponents(text),
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

  const parsed = await parseMsg91Response(res);
  if (!parsed.ok) {
    console.warn("[MSG91 template]", config.chatTemplateName, parsed.error, parsed.raw?.slice(0, 300));
    return { ok: false, error: parsed.error ?? "Template message failed" };
  }

  console.info("[MSG91 template] queued", {
    template: config.chatTemplateName,
    to: `${recipient.slice(0, 4)}***${recipient.slice(-2)}`,
    requestId: parsed.requestId,
  });

  return { ok: true, requestId: parsed.requestId, channel: "template" };
}

/**
 * CRM chat: template first (works without 24h session), then session text if client already messaged you.
 * Never uses WHATSAPP_MSG91_BOOKING_TEMPLATE (needs body_1–4 booking fields).
 */
export async function sendMsg91WhatsAppMessage(
  recipientNumber: string,
  text: string,
  options?: { hasActiveSession?: boolean }
): Promise<Msg91SendResult> {
  const config = getConfig();
  if (!config) {
    return {
      ok: false,
      error:
        "MSG91 WhatsApp is not configured. Set WHATSAPP_MSG91_AUTH_KEY, WHATSAPP_MSG91_INTEGRATED_NUMBER, and WHATSAPP_MSG91_NAMESPACE in .env.local.",
    };
  }

  const recipient = normalizeWhatsAppRecipient(recipientNumber);
  if (!recipient || recipient.length < 10) {
    return { ok: false, error: "Invalid recipient WhatsApp number." };
  }

  const prefixBlock = getBlockedPrefixError(recipient);
  if (prefixBlock) {
    console.warn("[MSG91] blocked prefix", recipient.slice(0, 4) + "***");
    return { ok: false, error: prefixBlock };
  }

  const hasSession = options?.hasActiveSession === true;

  // Client messaged within 24h → plain text only (no template wrapper)
  if (hasSession) {
    const session = await sendSessionText(config, recipient, text);
    if (session.ok) return session;
    return {
      ok: false,
      error:
        session.error ??
        "Could not send plain WhatsApp text. Ask the client to message your business number again.",
    };
  }

  // Cold outbound: template first (WhatsApp policy), then session fallback
  if (config.chatTemplateName) {
    const template = await sendChatTemplate(config, recipient, text);
    if (template.ok) return template;
    const session = await sendSessionText(config, recipient, text);
    if (session.ok) return session;
    return {
      ok: false,
      error: `Template (${config.chatTemplateName}): ${template.error}. Session: ${session.error}`,
    };
  }

  const session = await sendSessionText(config, recipient, text);
  if (session.ok) return session;

  return {
    ok: false,
    error:
      "Client must message your WhatsApp business number first (24h window), or set WHATSAPP_MSG91_CHAT_TEMPLATE for the first outbound message.",
  };
}

export function isMsg91Configured(): boolean {
  return getConfig() !== null;
}
