/** Select value prefixes for Contact / Lead association on deals */
export const DEAL_ASSOCIATE_PREFIX_CONTACT = "c:";
export const DEAL_ASSOCIATE_PREFIX_LEAD = "l:";

/** Prefer lead key when both set so the value matches the leads-first dropdown. */
export function encodeDealAssociate(
  contactId: string | null | undefined,
  salesLeadId: string | null | undefined
): string | undefined {
  if (salesLeadId) return `${DEAL_ASSOCIATE_PREFIX_LEAD}${salesLeadId}`;
  if (contactId) return `${DEAL_ASSOCIATE_PREFIX_CONTACT}${contactId}`;
  return undefined;
}

export function decodeDealAssociate(
  v: string | null | undefined
): { contact_id: string | null; sales_lead_id: string | null } {
  if (!v || typeof v !== "string") return { contact_id: null, sales_lead_id: null };
  if (v.startsWith(DEAL_ASSOCIATE_PREFIX_CONTACT)) {
    return { contact_id: v.slice(DEAL_ASSOCIATE_PREFIX_CONTACT.length) || null, sales_lead_id: null };
  }
  if (v.startsWith(DEAL_ASSOCIATE_PREFIX_LEAD)) {
    return { contact_id: null, sales_lead_id: v.slice(DEAL_ASSOCIATE_PREFIX_LEAD.length) || null };
  }
  return { contact_id: v, sales_lead_id: null };
}
