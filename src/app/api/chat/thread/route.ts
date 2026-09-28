import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { ensureClientWhatsAppLinked } from "@/lib/chat/client-whatsapp";
import { avatarHueFromId, companyInitials } from "@/lib/chat/mask";
import { getChatAuth } from "@/lib/chat/thread-access";

export const dynamic = "force-dynamic";

export type ClientThreadRow = {
  id: string;
  clientId: string;
  companyName: string;
  contactPerson: string | null;
  initials: string;
  avatarHue: number;
  campaignId: string;
  campaignName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  firstContactAt: string;
  hasWhatsApp: boolean;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const auth = await getChatAuth(supabase);
    if ("error" in auth) return auth.error;

    const { data: campaign, error: campErr } = await supabase
      .from("campaigns")
      .select(
        "id, name, organization_id, client_id, clients(company_name, contact_full_name, contact_person, contact_mobile)"
      )
      .eq("id", campaignId)
      .single();

    if (campErr || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    type CampRow = {
      id: string;
      name: string;
      organization_id: string;
      client_id: string | null;
      clients:
        | {
            company_name: string;
            contact_full_name: string | null;
            contact_person: string | null;
            contact_mobile: string | null;
          }
        | {
            company_name: string;
            contact_full_name: string | null;
            contact_person: string | null;
            contact_mobile: string | null;
          }[]
        | null;
    };

    const camp = campaign as CampRow;
    if (camp.organization_id !== auth.orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!camp.client_id) {
      return NextResponse.json({ error: "Campaign has no client assigned" }, { status: 400 });
    }

    const embedded = camp.clients;
    const clientRow = Array.isArray(embedded) ? embedded[0] : embedded;
    const companyName = clientRow?.company_name?.trim() || "Unknown client";
    const contactPerson =
      clientRow?.contact_full_name?.trim() || clientRow?.contact_person?.trim() || null;

    let threadId: string;
    let firstContactAt: string;

    const { data: existing } = await supabase
      .from("chat_threads")
      .select("id, created_at")
      .eq("client_id", camp.client_id)
      .eq("campaign_id", campaignId)
      .maybeSingle();

    if (existing) {
      const row = existing as { id: string; created_at: string };
      threadId = row.id;
      firstContactAt = row.created_at;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("chat_threads")
        .insert({
          organization_id: auth.orgId,
          client_id: camp.client_id,
          campaign_id: campaignId,
        } as never)
        .select("id, created_at")
        .single();

      if (createErr || !created) {
        return NextResponse.json({ error: createErr?.message ?? "Could not create thread" }, { status: 500 });
      }
      const row = created as { id: string; created_at: string };
      threadId = row.id;
      firstContactAt = row.created_at;
    }

    const { data: lastMsg } = await supabase
      .from("messages")
      .select("body, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let hasWhatsApp = false;
    const admin = getAdminClientSafe();
    if (admin) {
      hasWhatsApp = await ensureClientWhatsAppLinked(
        admin,
        camp.client_id,
        clientRow?.contact_mobile
      );
    }

    const last = lastMsg as { body: string; created_at: string } | null;
    const thread: ClientThreadRow = {
      id: threadId,
      clientId: camp.client_id,
      companyName,
      contactPerson,
      initials: companyInitials(companyName),
      avatarHue: avatarHueFromId(camp.client_id),
      campaignId: camp.id,
      campaignName: camp.name,
      lastMessage: last?.body ?? "No messages yet — start the conversation",
      lastMessageAt: last?.created_at ?? firstContactAt,
      unreadCount: 0,
      firstContactAt,
      hasWhatsApp,
    };

    return NextResponse.json({
      thread,
      currentAgentName: auth.agentName,
    });
  } catch (e) {
    console.error("GET /api/chat/thread:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
