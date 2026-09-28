import type { LhoData } from "@/lib/generateLhoPdf";
import {
  normalizeCampaignQuestions,
  normalizeCqAnswerValue,
  type CampaignQuestion,
} from "@/lib/campaign-questions";

export type LhoCampaignQuestionRow = {
  label: string;
  answer: string;
};

function str(val: unknown): string {
  return val != null ? String(val).trim() : "";
}

function answerForKey(
  data: Pick<LhoData, "cq1" | "cq2" | "cq3" | "cq4" | "cq5" | "extraCq">,
  key: string
): string {
  const k = key.toLowerCase();
  if (k === "cq1") return normalizeCqAnswerValue(data.cq1);
  if (k === "cq2") return normalizeCqAnswerValue(data.cq2);
  if (k === "cq3") return normalizeCqAnswerValue(data.cq3);
  if (k === "cq4") return normalizeCqAnswerValue(data.cq4);
  if (k === "cq5") return normalizeCqAnswerValue(data.cq5);
  return normalizeCqAnswerValue(data.extraCq[k]);
}

function hasCqAnswer(value: string): boolean {
  return value.trim().length > 0;
}

/** Demand & Qualification Insights (campaign questions) + answers for LHO PDF. */
export function buildLhoCampaignQuestionRows(
  data: Pick<LhoData, "cq1" | "cq2" | "cq3" | "cq4" | "cq5" | "extraCq">,
  campaignQuestions?: CampaignQuestion[] | null
): LhoCampaignQuestionRow[] {
  const configured = normalizeCampaignQuestions(campaignQuestions ?? []);

  if (configured.length > 0) {
    return configured
      .map((q) => ({
        label: q.label,
        answer: answerForKey(data, q.key),
      }))
      .filter((row) => hasCqAnswer(row.answer));
  }

  const legacy: LhoCampaignQuestionRow[] = [];
  for (let i = 1; i <= 5; i++) {
    const answer = answerForKey(data, `cq${i}`);
    if (hasCqAnswer(answer)) legacy.push({ label: `CQ${i}`, answer });
  }

  const extraKeys = Object.keys(data.extraCq).sort((a, b) => {
    const na = Number(/^cq(\d+)$/i.exec(a)?.[1] ?? 0);
    const nb = Number(/^cq(\d+)$/i.exec(b)?.[1] ?? 0);
    return na - nb;
  });
  for (const key of extraKeys) {
    const answer = data.extraCq[key];
    if (hasCqAnswer(answer)) legacy.push({ label: key.toUpperCase(), answer });
  }

  return legacy;
}

export function resolveCampaignQuestionsFromLeadRaw(
  raw: Record<string, unknown>
): CampaignQuestion[] {
  if (raw.campaign_questions != null) {
    return normalizeCampaignQuestions(raw.campaign_questions);
  }
  const campaigns = raw.campaigns;
  if (campaigns && typeof campaigns === "object" && !Array.isArray(campaigns)) {
    return normalizeCampaignQuestions(
      (campaigns as Record<string, unknown>).campaign_questions
    );
  }
  return [];
}
