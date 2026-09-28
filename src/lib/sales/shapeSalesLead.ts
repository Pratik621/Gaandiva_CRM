import { leadCreatedByName } from "@/lib/lead-display-names";

export function shapeSalesLeadForApi(
  l: Record<string, unknown>,
  userNames: Record<string, string>,
  accountCompanyNames: Record<string, string>
) {
  const primaryName =
    (l.lead_name as string | null) ||
    [l.first_name, l.last_name]
      .filter((p) => p && String(p).trim())
      .join(" ")
      .trim() ||
    null;

  const aid = l.account_id as string | null | undefined;

  return {
    id: l.id,
    lead_name: primaryName,
    first_name: l.first_name ?? null,
    last_name: l.last_name ?? null,
    company: l.company_name ?? null,
    account_id: aid ?? null,
    account_company_name: aid ? accountCompanyNames[aid] ?? null : null,
    email: l.email,
    phone: l.phone,
    alt_phone: l.alt_phone ?? null,
    job_title: l.job_title ?? null,
    linkedin: l.linkedin ?? null,
    department: l.department ?? null,
    website: l.website ?? null,
    industry: l.industry ?? null,
    company_size: l.company_size ?? null,
    annual_revenue: l.annual_revenue ?? null,
    business_type: l.business_type ?? null,
    gst_number: l.gst_number ?? null,
    pan_number: l.pan_number ?? null,
    country: l.country ?? null,
    state: l.state ?? null,
    city: l.city ?? null,
    zip: l.zip ?? null,
    address: l.address ?? null,
    budget: l.budget ?? null,
    decision_maker: l.decision_maker ?? null,
    purchase_timeline: l.purchase_timeline ?? null,
    current_solution: l.current_solution ?? null,
    pain_points: l.pain_points ?? null,
    requirements: l.requirements ?? null,
    lead_source: l.lead_source,
    source_type: l.source_type ?? null,
    source_campaign: l.source_campaign ?? null,
    utm_source: l.utm_source ?? null,
    utm_medium: l.utm_medium ?? null,
    utm_campaign: l.utm_campaign ?? null,
    status: l.status,
    lead_score: l.lead_score ?? null,
    deal_stage: l.deal_stage ?? null,
    deal_value: l.deal_value ?? null,
    probability: l.probability ?? null,
    expected_close_date: l.expected_close_date ?? null,
    product_interest: l.product_interest ?? null,
    last_contacted: l.last_contacted ?? null,
    next_followup: l.next_followup ?? null,
    followup_type: l.followup_type ?? null,
    interaction_notes: l.interaction_notes ?? null,
    qualification_status: l.qualification_status ?? null,
    qa_status: l.qa_status ?? null,
    disqualification_reason: l.disqualification_reason ?? null,
    rectified_reason: l.rectified_reason ?? null,
    assigned_to_id: l.assigned_agent_id,
    assigned_to_name: l.assigned_agent_id
      ? userNames[l.assigned_agent_id as string] ?? "—"
      : null,
    created_at: l.created_at,
    created_by_name: leadCreatedByName(
      {
        created_by: l.created_by as string | null,
        assigned_agent_id: l.assigned_agent_id as string | null,
        lead_id: l.lead_id as string | null,
        creator_display_name: l.creator_display_name as string | null,
      },
      userNames
    ),
    updated_at: l.updated_at ?? null,
    tags: l.tags ?? null,
    converted: l.status === "converted",
    converted_at: null,
  };
}
