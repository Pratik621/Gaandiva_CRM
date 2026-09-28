// These values must match the `sales_leads_status_check` constraint in Postgres.
export const LEAD_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "open_deal", label: "Open deal" },
  { value: "unqualified", label: "Unqualified" },
  { value: "attempted_to_contact", label: "Attempted to contact" },
  { value: "connected", label: "Connected" },
  { value: "bad_timing", label: "Bad timing" },
] as const;

export const LIFECYCLE_STAGE_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "marketing_qualified_lead", label: "Marketing Qualified Lead" },
  { value: "sales_qualified_lead", label: "Sales Qualified Lead" },
  { value: "opportunity", label: "Opportunity" },
  { value: "customer", label: "Customer" },
  { value: "evangelist", label: "Evangelist" },
  { value: "other", label: "Other" },
] as const;
