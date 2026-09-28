import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe } from "@/lib/supabase/admin";
import { PRIVILEGED_VOICE_ROLES, type VoiceRecording } from "@/lib/voice-recordings";
import { listVoiceRecordingsForLeads } from "@/lib/lead-assets";

export const dynamic = "force-dynamic";

const MAX_BATCH_LEADS = 100;

type LeadRow = { id: string; campaign_id: string; organization_id: string };

/**
 * Batch voice recordings for the leads visible on one table page.
 * Reads lead_assets catalog (one query) and mints signed URLs in a single
 * createSignedUrls call. Missing catalog rows return [] unless
 * ENABLE_STORAGE_LIST_FALLBACK=true.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const leadIds = Array.isArray(body?.leadIds)
      ? [...new Set((body.leadIds as unknown[]).filter((v): v is string => typeof v === "string" && v.length > 0))].slice(
          0,
          MAX_BATCH_LEADS
        )
      : [];

    if (leadIds.length === 0) {
      return NextResponse.json({ recordings: {} });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ recordings: {} });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);
    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
      .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
      .filter((n): n is string => !!n);
    const isPrivileged = roleNames.some((r) => PRIVILEGED_VOICE_ROLES.has(r));

    let leads: LeadRow[] = [];
    if (isPrivileged) {
      const { data } = await admin
        .from("leads")
        .select("id, campaign_id, organization_id")
        .in("id", leadIds)
        .eq("organization_id", orgId);
      leads = (data ?? []) as LeadRow[];
    } else {
      const { data } = await supabase
        .from("leads")
        .select("id, campaign_id, organization_id")
        .in("id", leadIds);
      leads = ((data ?? []) as LeadRow[]).filter((l) => l.organization_id === orgId);
    }

    const byLead = await listVoiceRecordingsForLeads(admin, admin, orgId, leads);

    const recordings: Record<string, VoiceRecording[]> = {};
    for (const id of leadIds) {
      recordings[id] = byLead[id] ?? [];
    }

    return NextResponse.json({ recordings });
  } catch (err) {
    console.error("voice-recordings batch error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
