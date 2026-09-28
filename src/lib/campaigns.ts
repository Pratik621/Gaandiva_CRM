/**
 * Generates a unique Campaign ID for new campaigns.
 * Format: CMP-CLIENTNAME-CAMPAIGNNAME-YYYY-MMDD-XXXX
 * Example: CMP-ACME-SUMMER2026-2026-0225-A7X9
 *
 * - Client and campaign names are sanitized (uppercase, alphanumeric, max length).
 * - Date is MMDD (month/day).
 * - Random suffix ensures uniqueness even for same client/campaign/date.
 */

const PREFIX = "CMP";
const MAX_PART_LENGTH = 24;
const RANDOM_LENGTH = 4;
const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * Sanitize a string for use in campaign_id: uppercase, alphanumeric only, limited length.
 */
function sanitizePart(value: string, maxLength: number = MAX_PART_LENGTH): string {
  if (!value || typeof value !== "string") return "UNKNOWN";
  const cleaned = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const truncated = cleaned.slice(0, maxLength);
  return truncated || "X";
}

/**
 * Generate a short random alphanumeric code (e.g. A7X9).
 */
function randomSuffix(length: number = RANDOM_LENGTH): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += ALPHANUMERIC[Math.floor(Math.random() * ALPHANUMERIC.length)];
  }
  return result;
}

/**
 * Get current date parts: year and MMDD.
 */
function getDateParts(): { year: number; mmdd: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return { year, mmdd: `${month}${day}` };
}

export interface GenerateCampaignIdInput {
  clientName: string;
  campaignName: string;
}

/**
 * Generate a unique campaign ID.
 * Validates inputs and returns a string in format:
 * CMP-CLIENTNAME-CAMPAIGNNAME-YYYY-MMDD-XXXX
 *
 * @throws Error if clientName or campaignName is missing or invalid
 */
export function generateCampaignId(input: GenerateCampaignIdInput): string {
  const { clientName, campaignName } = input;

  if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
    throw new Error("Client name is required to generate Campaign ID");
  }
  if (!campaignName || typeof campaignName !== "string" || !campaignName.trim()) {
    throw new Error("Campaign name is required to generate Campaign ID");
  }

  const clientPart = sanitizePart(clientName);
  const campaignPart = sanitizePart(campaignName);
  const { year, mmdd } = getDateParts();
  const random = randomSuffix();

  return `${PREFIX}-${clientPart}-${campaignPart}-${year}-${mmdd}-${random}`;
}
