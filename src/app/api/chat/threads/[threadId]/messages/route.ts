import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { ensureClientWhatsAppLinked } from "@/lib/chat/client-whatsapp";
import { sendMsg91WhatsAppMessage, isMsg91Configured } from "@/lib/chat/msg91-whatsapp";
import { assertThreadAccess } from "@/lib/chat/thread-access";
import { threadHasActiveWhatsAppSession } from "@/lib/chat/thread-session";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ threadId: string }> };

export async function GET(_request: Request, ctx: RouteCtx) {
  try {
    const { threadId } = await ctx.params;
    const supabase = await createClient();
    const access = await assertThreadAccess(supabase, threadId);
    if ("error" in access) return access.error;

    const { data: rows, error } = await supabase
      .from("messages")
      .select("id, direction, body, status, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type MessageRow = {
      id: string;
      direction: string;
      body: string;
      status: string | null;
      created_at: string;
    };

    const messages = ((rows ?? []) as MessageRow[]).map((m) => ({
      id: m.id,
      direction: m.direction as "inbound" | "outbound",
      body: m.body,
      createdAt: m.created_at,
      status: m.status as "sent" | "delivered" | "read" | "failed",
    }));

    return NextResponse.json({ messages });
  } catch (e) {
    console.error("GET thread messages:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteCtx) {
  try {
    const { threadId } = await ctx.params;
    const supabase = await createClient();
    const access = await assertThreadAccess(supabase, threadId);
    if ("error" in access) return access.error;

    const body = (await request.json()) as { body?: string };
    const text = body.body?.trim();
    if (!text) {
      return NextResponse.json({ error: "body is required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 503 });
    }

    const linked = await ensureClientWhatsAppLinked(admin, access.thread.client_id);
    if (!linked) {
      return NextResponse.json(
        {
          error:
            "No WhatsApp number for this client. Add a valid Mobile number under Sales → Clients, then try again.",
        },
        { status: 400 }
      );
    }

    const { data: contactRow } = await admin
      .from("client_contacts")
      .select("wa_number")
      .eq("client_id", access.thread.client_id)
      .maybeSingle();

    const waNumber = (contactRow as { wa_number: string } | null)?.wa_number;
    if (!waNumber) {
      return NextResponse.json({ error: "Client WhatsApp number not found." }, { status: 400 });
    }

    if (!isMsg91Configured()) {
      return NextResponse.json(
        {
          error:
            "WhatsApp delivery is not configured. Add MSG91 variables to .env.local and restart the server.",
        },
        { status: 503 }
      );
    }

    const hasActiveSession = await threadHasActiveWhatsAppSession(admin, threadId);
    const waResult = await sendMsg91WhatsAppMessage(waNumber, text, { hasActiveSession });
    if (!waResult.ok) {
      console.error("[chat/whatsapp]", {
        threadId,
        clientId: access.thread.client_id,
        channel: "failed",
        error: waResult.error,
      });
      return NextResponse.json(
        { error: waResult.error },
        { status: 502 }
      );
    }

    console.info("[chat/whatsapp] sent", {
      threadId,
      channel: waResult.channel,
      requestId: waResult.requestId,
    });

    const { data: inserted, error: insErr } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "outbound",
        body: text,
        status: "sent",
        wa_message_id: waResult.requestId,
        sent_by: access.user.id,
      } as never)
      .select("id, direction, body, status, created_at")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await supabase
      .from("chat_threads")
      .update({ updated_at: new Date().toISOString() } as never)
      .eq("id", threadId);

    const row = inserted as {
      id: string;
      direction: string;
      body: string;
      status: string;
      created_at: string;
    };

    return NextResponse.json({
      message: {
        id: row.id,
        direction: "outbound",
        body: row.body,
        createdAt: row.created_at,
        status: row.status,
      },
      whatsappChannel: waResult.channel,
    });
  } catch (e) {
    console.error("POST thread message:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
