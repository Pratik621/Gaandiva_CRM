import { NextResponse } from "next/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { handleMsg91InboundWebhook } from "@/lib/chat/msg91-inbound";

export const dynamic = "force-dynamic";

/**
 * MSG91 WhatsApp inbound webhook.
 * Configure in MSG91 panel → WhatsApp → Webhook → Inbound:
 *   https://YOUR_DOMAIN/api/webhooks/msg91/whatsapp
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.WHATSAPP_MSG91_WEBHOOK_SECRET?.trim();
    if (secret) {
      const header =
        request.headers.get("x-msg91-signature") ??
        request.headers.get("authkey") ??
        request.headers.get("x-webhook-secret");
      if (header !== secret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const result = await handleMsg91InboundWebhook(admin, body);

    if (!result.ok) {
      console.warn("[MSG91 inbound]", result.reason, JSON.stringify(body).slice(0, 400));
      return NextResponse.json({ ok: true, skipped: result.reason });
    }

    console.info("[MSG91 inbound] stored", {
      threadId: result.threadId,
      messageId: result.messageId,
    });

    return NextResponse.json({ ok: true, threadId: result.threadId, messageId: result.messageId });
  } catch (e) {
    console.error("[MSG91 inbound] error", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "MSG91 WhatsApp inbound webhook. POST JSON payloads here.",
  });
}
