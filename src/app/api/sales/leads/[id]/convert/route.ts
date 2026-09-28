import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";

export const dynamic = "force-dynamic";

async function getUserAndOrg() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[])
    .map((r) => r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_"))
    .filter(Boolean) as string[];

  const canConvert =
    roleNames.includes("sales") ||
    roleNames.includes("sales_manager") ||
    roleNames.includes("admin");

  if (!canConvert) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, orgId };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await getUserAndOrg();
    if ("error" in ctx) return ctx.error;
    const { user, orgId } = ctx;

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    // ── 1. Fetch the lead ────────────────────────────────────────────────────
    const { data: leadRow, error: leadErr } = await admin
      .from("sales_leads")
      .select("*")
      .eq("id", params.id)
      .eq("organization_id", orgId)
      .single();

    if (leadErr || !leadRow) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const lead = leadRow as Record<string, unknown>;

    if (lead.converted === true) {
      return NextResponse.json({ error: "Lead is already converted" }, { status: 409 });
    }

    // ── 2. Read body ─────────────────────────────────────────────────────────
    const body = await request.json();
    const {
      company_name,
      contact_name,
      create_deal,
      deal_value,
      deal_stage,
    }: {
      company_name?: string;
      contact_name?: string;
      create_deal?: boolean;
      deal_value?: number | null;
      deal_stage?: string | null;
    } = body ?? {};

    const resolvedCompanyName = (
      company_name ||
      (lead.company_name as string) ||
      (lead.company as string) ||
      ""
    ).trim();
    const resolvedContactName = (contact_name || (lead.lead_name as string) || "").trim();

    if (!resolvedCompanyName) {
      return NextResponse.json({ error: "Company name is required for conversion" }, { status: 400 });
    }
    if (!resolvedContactName) {
      return NextResponse.json({ error: "Contact name is required for conversion" }, { status: 400 });
    }

    // ── 3. Find or create Account (reuse lead-linked account when present) ───
    let accountId: string;
    let accountCreatedNew = false;
    const linkedAccountId = lead.account_id as string | null | undefined;
    if (linkedAccountId) {
      accountId = linkedAccountId;
    } else {
      const { data: existingAccount } = await admin
        .from("accounts")
        .select("id")
        .ilike("company_name", resolvedCompanyName)
        .limit(1)
        .maybeSingle() as { data: { id: string } | null };

      if (existingAccount?.id) {
        accountId = existingAccount.id;
      } else {
        const { data: newAccount, error: accErr } = await admin
          .from("accounts")
          .insert({
            company_name: resolvedCompanyName,
            industry: (lead.industry as string | null) ?? null,
            website: (lead.website as string | null) ?? null,
            phone: (lead.phone as string | null) ?? null,
            address: (lead.address as string | null) ?? null,
            owner_id: user!.id,
          } as never)
          .select("id")
          .single();

        if (accErr || !newAccount) {
          return NextResponse.json({ error: accErr?.message ?? "Failed to create account" }, { status: 500 });
        }
        accountId = (newAccount as { id: string }).id;
        accountCreatedNew = true;
      }
    }

    // ── 4. Duplicate contact check ───────────────────────────────────────────
    const leadEmail = (lead.email as string | null) ?? null;
    if (leadEmail) {
      const { data: existingContact } = await admin
        .from("contacts")
        .select("id, contact_name")
        .ilike("email", leadEmail)
        .limit(1)
        .maybeSingle();

      if (existingContact) {
        return NextResponse.json(
          {
            error: `A contact with email "${leadEmail}" already exists (${(existingContact as { contact_name: string | null }).contact_name ?? "unknown"}).`,
            duplicate_contact_id: (existingContact as { id: string }).id,
          },
          { status: 409 }
        );
      }
    }

    // ── 5. Create Contact ────────────────────────────────────────────────────
    const { data: newContact, error: ctcErr } = await admin
      .from("contacts")
      .insert({
        contact_name: resolvedContactName,
        email: leadEmail,
        phone: (lead.phone as string | null) ?? null,
        job_title: (lead.job_title as string | null) ?? null,
        account_id: accountId,
        owner_id: user!.id,
        first_name: (lead.first_name as string | null) ?? null,
        last_name: (lead.last_name as string | null) ?? null,
        alt_phone: (lead.alt_phone as string | null) ?? null,
        linkedin: (lead.linkedin as string | null) ?? null,
        department: (lead.department as string | null) ?? null,
        website: (lead.website as string | null) ?? null,
        industry: (lead.industry as string | null) ?? null,
        country: (lead.country as string | null) ?? null,
        state: (lead.state as string | null) ?? null,
        city: (lead.city as string | null) ?? null,
        zip: (lead.zip as string | null) ?? null,
        address: (lead.address as string | null) ?? null,
        lead_source: (lead.lead_source as string | null) ?? null,
        lead_score:
          typeof lead.lead_score === "number"
            ? lead.lead_score
            : null,
        status: "active",
      } as never)
      .select("id")
      .single();

    if (ctcErr || !newContact) {
      return NextResponse.json({ error: ctcErr?.message ?? "Failed to create contact" }, { status: 500 });
    }
    const contactId = (newContact as { id: string }).id;

    // ── 6. Optionally create Deal ────────────────────────────────────────────
    let dealId: string | null = null;
    if (create_deal) {
      const { data: newDeal, error: dealErr } = await admin
        .from("deals")
        .insert({
          deal_name: `${resolvedCompanyName} Deal`,
          account_id: accountId,
          contact_id: contactId,
          value: typeof deal_value === "number" ? deal_value : null,
          stage: deal_stage || "qualification",
          owner_id: user!.id,
        } as never)
        .select("id")
        .single();

      if (dealErr || !newDeal) {
        return NextResponse.json({ error: dealErr?.message ?? "Failed to create deal" }, { status: 500 });
      }
      dealId = (newDeal as { id: string }).id;
    }

    // ── 7. Mark lead as converted ────────────────────────────────────────────
    const { error: updateErr } = await admin
      .from("sales_leads")
      .update({
        status: "converted",
        converted: true,
        converted_at: new Date().toISOString(),
        converted_account_id: accountId,
        converted_contact_id: contactId,
        converted_deal_id: dealId,
      } as never)
      .eq("id", params.id)
      .eq("organization_id", orgId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Notify the campaign's assigned TL about the conversion
    const campaignId = (lead.campaign_id as string | null) ?? null;
    if (campaignId) {
      const { data: campRow } = await admin
        .from("campaigns")
        .select("assigned_team_leader_id")
        .eq("id", campaignId)
        .maybeSingle();
      const tlId = (campRow as { assigned_team_leader_id: string | null } | null)
        ?.assigned_team_leader_id;
      if (tlId && tlId !== user!.id) {
        void createNotification({
          title: "Lead Converted",
          message: `Lead "${resolvedContactName}" from ${resolvedCompanyName} has been converted to a contact${dealId ? " with a new deal" : ""}.`,
          type: "lead",
          sender_id: user!.id,
          receiver_id: tlId,
          reference_type: "lead",
          reference_id: params.id,
          organization_id: orgId,
        });
      }
    }

    // Also notify the user's reporting manager if one exists
    const { data: senderProfile } = await admin
      .from("users")
      .select("reporting_manager_id")
      .eq("id", user!.id)
      .maybeSingle();
    const managerId = (senderProfile as { reporting_manager_id: string | null } | null)
      ?.reporting_manager_id;
    if (managerId && managerId !== user!.id) {
      void createNotification({
        title: "Lead Converted",
        message: `${resolvedContactName} (${resolvedCompanyName}) has been successfully converted.`,
        type: "lead",
        sender_id: user!.id,
        receiver_id: managerId,
        reference_type: "lead",
        reference_id: params.id,
        organization_id: orgId,
      });
    }

    return NextResponse.json({
      success: true,
      account_id: accountId,
      contact_id: contactId,
      deal_id: dealId,
      account_created: accountCreatedNew,
    });
  } catch (err) {
    console.error("Lead convert POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
