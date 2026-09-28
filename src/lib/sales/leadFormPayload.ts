import dayjs from "dayjs";

export function dateToIso(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val;
  if (dayjs.isDayjs(val)) return val.toISOString();
  return null;
}

/** Build JSON body for POST /api/sales/leads or PATCH /api/sales/leads/[id]. */
export function buildSalesLeadPayload(values: Record<string, unknown>) {
  const composedLeadName =
    (values.lead_name as string) ||
    [values.first_name, values.last_name]
      .filter((p) => p != null && String(p).trim())
      .join(" ")
      .trim() ||
    null;

  return {
    lead_name: composedLeadName,
    first_name: values.first_name || null,
    last_name: values.last_name || null,
    company: values.company || null,
    email: values.email || null,
    phone: values.phone || null,
    alt_phone: values.alt_phone || null,
    job_title: values.job_title || null,
    linkedin: values.linkedin || null,
    department: values.department || null,
    lead_source: values.lead_source || null,
    // Don't force a status default; DB has its own defaults + CHECK constraints.
    status:
      typeof values.status === "string" && values.status.trim().length > 0
        ? values.status.trim()
        : undefined,
    lead_score:
      typeof values.lead_score === "string" && values.lead_score.trim()
        ? values.lead_score.trim()
        : null,
    website: values.website || null,
    industry: values.industry || null,
    company_size: values.company_size || null,
    annual_revenue: values.annual_revenue || null,
    business_type: values.business_type || null,
    gst_number: values.gst_number || null,
    pan_number: values.pan_number || null,
    country: values.country || null,
    state: values.state || null,
    city: values.city || null,
    zip: values.zip || null,
    address: values.address || null,
    budget: values.budget || null,
    decision_maker: values.decision_maker || null,
    purchase_timeline: values.purchase_timeline || null,
    current_solution: values.current_solution || null,
    pain_points: values.pain_points || null,
    requirements: values.requirements || null,
    deal_stage: values.deal_stage || null,
    deal_value: values.deal_value || null,
    probability: typeof values.probability === "number" ? values.probability : null,
    expected_close_date: dateToIso(values.expected_close_date),
    product_interest: values.product_interest || null,
    last_contacted: dateToIso(values.last_contacted),
    next_followup: dateToIso(values.next_followup),
    followup_type: values.followup_type || null,
    interaction_notes: values.interaction_notes || null,
    disqualification_reason: values.disqualification_reason || null,
    tags: (values.tags as string[]) || [],
    assigned_to_id: values.assigned_to_id === undefined ? undefined : (values.assigned_to_id as string | null),
  };
}

/** Map API lead (shaped) → Ant Design Form values. */
export function leadRecordToFormValues(lead: Record<string, unknown>) {
  let firstName = lead.first_name != null ? String(lead.first_name) : "";
  let lastName = lead.last_name != null ? String(lead.last_name) : "";
  if (!firstName && !lastName && lead.lead_name) {
    const parts = String(lead.lead_name).trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  return {
    lead_name: lead.lead_name ?? "",
    first_name: firstName,
    last_name: lastName,
    company: lead.company ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    alt_phone: lead.alt_phone ?? "",
    job_title: lead.job_title ?? "",
    linkedin: lead.linkedin ?? "",
    department: lead.department ?? "",
    lead_source: lead.lead_source ?? "",
    status: lead.status ?? "new",
    lead_score:
      lead.lead_score !== null && lead.lead_score !== undefined
        ? String(lead.lead_score)
        : undefined,
    website: lead.website ?? "",
    industry: lead.industry ?? "",
    company_size: lead.company_size ?? "",
    annual_revenue: lead.annual_revenue ?? "",
    business_type: lead.business_type ?? "",
    gst_number: lead.gst_number ?? "",
    pan_number: lead.pan_number ?? "",
    country: lead.country ?? "",
    state: lead.state ?? "",
    city: lead.city ?? "",
    zip: lead.zip ?? "",
    address: lead.address ?? "",
    budget: lead.budget ?? "",
    decision_maker: lead.decision_maker ?? undefined,
    purchase_timeline: lead.purchase_timeline ?? "",
    current_solution: lead.current_solution ?? "",
    pain_points: lead.pain_points ?? "",
    requirements: lead.requirements ?? "",
    deal_stage: lead.deal_stage ?? "",
    deal_value: lead.deal_value ?? "",
    probability: lead.probability ?? undefined,
    expected_close_date: lead.expected_close_date ? dayjs(lead.expected_close_date as string) : null,
    product_interest: lead.product_interest ?? "",
    last_contacted: lead.last_contacted ? dayjs(lead.last_contacted as string) : null,
    next_followup: lead.next_followup ? dayjs(lead.next_followup as string) : null,
    followup_type: lead.followup_type ?? undefined,
    interaction_notes: lead.interaction_notes ?? "",
    disqualification_reason: lead.disqualification_reason ?? "",
    assigned_to_id: lead.assigned_to_id ?? undefined,
    created_by: lead.created_by_name ?? "",
    updated_by: "",
    created_at: lead.created_at ? dayjs(lead.created_at as string) : null,
    updated_at: lead.updated_at ? dayjs(lead.updated_at as string) : null,
    tags: lead.tags ?? [],
  };
}
