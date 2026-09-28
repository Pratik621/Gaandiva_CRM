/**
 * Consent PDF Generator
 * Returns a real PDF (application/pdf) built with @react-pdf/renderer.
 * Includes: lead info, campaign info, consent records, audit history, SHA-256 hash.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, queryLeadHistory, getProfile } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  applyClientViewerLeadScope,
} from "@/lib/command/client-viewer-scope";
import { generateConsentPDF, type ConsentPDFData } from "@/lib/command/pdf";

export const dynamic = "force-dynamic";

type AnyFn = (s: unknown) => unknown;
const dbAny: AnyFn = (s) => s;

interface ConsentRecord {
  id: string;
  consent_given_at: string | null;
  consent_method: string | null;
  ip_address: string | null;
  recording_url: string | null;
  consent_text: string | null;
  sha256_hash: string | null;
  created_at: string;
}

interface CampaignInfo {
  id: string;
  name: string;
  campaign_id: string;
  client_name: string | null;
  start_date: string | null;
  end_date: string | null;
}

type LeadWithCampaign = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  consent_status: string | null;
  channel: string | null;
  created_at: string;
  campaign_id: string;
  campaigns: CampaignInfo | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await getProfile(supabase, user.id);

  // Fetch lead + campaign
  let leadQuery = supabase
    .from("leads")
    .select(
      "id, name, email, phone, status, consent_status, channel, created_at, campaign_id, " +
        "campaigns(id, name, campaign_id, client_name, start_date, end_date)"
    )
    .eq("id", id);

  if (userRoles.includes("client_viewer")) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    leadQuery = applyClientViewerLeadScope(leadQuery, scope, { joinOnCampaigns: true });
  }

  const { data: leadRaw, error: leadErr } = (await leadQuery
    .single()) as unknown as {
    data: LeadWithCampaign | null;
    error: { message: string } | null;
  };

  if (leadErr || !leadRaw) {
    return NextResponse.json(
      { error: leadErr?.message ?? "Lead not found" },
      { status: 404 }
    );
  }

  // Fetch consent records
  const { data: consentRaw } = (await (
    dbAny(supabase) as ReturnType<typeof supabase.from>
  )
    .from("consent_records")
    .select(
      "id, consent_given_at, consent_method, ip_address, recording_url, consent_text, sha256_hash, created_at"
    )
    .eq("lead_id", id)
    .order("created_at", { ascending: false })) as {
    data: ConsentRecord[] | null;
  };

  // Fetch lead history (first page only for PDF)
  const histResult = await queryLeadHistory(supabase, id, { limit: 50 });

  const generatedAt = new Date().toISOString();

  const pdfData: ConsentPDFData = {
    lead: {
      id: leadRaw.id,
      name: leadRaw.name ?? "Unknown",
      email: leadRaw.email,
      phone: leadRaw.phone,
      status: leadRaw.status,
      consent_status: leadRaw.consent_status,
      channel: leadRaw.channel,
      created_at: leadRaw.created_at,
    },
    campaign: {
      name: leadRaw.campaigns?.name ?? "—",
      campaign_id: leadRaw.campaigns?.campaign_id ?? null,
      start_date: leadRaw.campaigns?.start_date ?? null,
      end_date: leadRaw.campaigns?.end_date ?? null,
    },
    consentRecords: (consentRaw ?? []).map((cr) => ({
      consent_method: cr.consent_method,
      consent_given_at: cr.consent_given_at,
      ip_address: cr.ip_address,
      recording_url: cr.recording_url,
      consent_text: cr.consent_text,
      sha256_hash: cr.sha256_hash,
    })),
    history: histResult.items.map((h) => ({
      change_type: h.change_type,
      old_value: h.old_value,
      new_value: h.new_value,
      reason: h.reason,
      created_at: h.created_at,
    })),
    generatedAt,
  };

  try {
    const pdfBuffer = await generateConsentPDF(pdfData);

    const filename = `consent-${leadRaw.id.slice(0, 8)}-${Date.now()}.pdf`;

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
      },
    });
  } catch (err) {
    console.error("[consent-pdf] PDF generation error:", err);
    return NextResponse.json(
      { error: "PDF generation failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
