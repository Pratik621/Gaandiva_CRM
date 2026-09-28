/** Campaign list/detail: prefer client-based campaign_code, else legacy campaign_id. */
export function campaignHeaderDisplayCode(c: {
  campaign_code?: string | null;
  campaign_id?: string | null;
}): { text: string; isStructuredCode: boolean } | null {
  const code = (c.campaign_code ?? "").trim();
  if (code) return { text: code, isStructuredCode: true };
  const id = (c.campaign_id ?? "").trim();
  if (id) return { text: id, isStructuredCode: false };
  return null;
}
