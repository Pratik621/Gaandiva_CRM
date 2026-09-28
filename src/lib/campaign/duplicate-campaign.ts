import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import { generateCampaignId } from "@/lib/campaigns";
import {
  campaignQuestionsToDbValue,
  normalizeCampaignQuestions,
} from "@/lib/campaign-questions";
import { getAdminClientSafe } from "@/lib/supabase/admin";

const BUCKET = "campaign-files";
const MAX_CAMPAIGN_ID_RETRIES = 10;

const SOURCE_CAMPAIGN_SELECT =
  "id, organization_id, name, client_id, client_name, description, industry, geography, target_designation, lead_type, campaign_type, start_date, end_date, cpl, revenue, booked, total_allocation, post_qa, weekly_call, weekly_report, additional_comments, employee_size, revenue_size, abm, seniority, job_function, creatives_url, campaign_questions, qualification_criteria, alert_config, lead_aggregated";

type SourceCampaignRow = {
  id: string;
  organization_id: string;
  name: string;
  client_id: string | null;
  client_name: string | null;
  description: string | null;
  industry: string | null;
  geography: string | null;
  target_designation: string | null;
  lead_type: string | null;
  campaign_type: string | null;
  start_date: string | null;
  end_date: string | null;
  cpl: number | null;
  revenue: number | null;
  booked: number | null;
  total_allocation: number | null;
  post_qa: number | null;
  weekly_call: string | null;
  weekly_report: string | null;
  additional_comments: string | null;
  employee_size: string[] | null;
  revenue_size: string[] | null;
  abm: boolean | null;
  seniority: string | null;
  job_function: string | null;
  creatives_url: string[] | null;
  campaign_questions: unknown;
  qualification_criteria: unknown;
  alert_config: unknown;
  lead_aggregated: string | null;
};

type CampaignFileRow = {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
}

/** Default duplicate name: original name + current month label. */
export function buildDefaultDuplicateCampaignName(sourceName: string): string {
  const monthLabel = dayjs().format("MMMM YYYY");
  const trimmed = sourceName.trim();
  if (!trimmed) return monthLabel;
  return `${trimmed} - ${monthLabel}`;
}

async function generateUniqueCampaignDisplayId(
  supabase: SupabaseClient,
  clientName: string,
  campaignName: string
): Promise<string> {
  let attempts = 0;
  for (;;) {
    const campaignId = generateCampaignId({ clientName, campaignName });
    const { data: existing } = await supabase
      .from("campaigns")
      .select("id")
      .eq("campaign_id", campaignId)
      .maybeSingle();
    if (!existing) return campaignId;
    attempts++;
    if (attempts >= MAX_CAMPAIGN_ID_RETRIES) {
      throw new Error("Could not generate a unique Campaign ID. Please try again.");
    }
  }
}

export async function duplicateCampaign(opts: {
  supabase: SupabaseClient;
  orgId: string;
  sourceCampaignId: string;
  newName: string;
  userId: string;
}): Promise<{
  id: string;
  campaign_id: string;
  campaign_code: string | null;
  filesCopied: number;
  fileErrors: string[];
}> {
  const { supabase, orgId, sourceCampaignId, newName, userId } = opts;
  const trimmedName = newName.trim();
  if (!trimmedName) {
    throw new Error("Campaign name is required");
  }

  const { data: sourceRaw, error: sourceError } = await supabase
    .from("campaigns")
    .select(SOURCE_CAMPAIGN_SELECT)
    .eq("id", sourceCampaignId)
    .eq("organization_id", orgId)
    .single();

  if (sourceError || !sourceRaw) {
    throw new Error("Campaign not found");
  }

  const source = sourceRaw as SourceCampaignRow;
  const clientNameStr = source.client_name?.trim() || "Client";
  const campaignDisplayId = await generateUniqueCampaignDisplayId(
    supabase,
    clientNameStr,
    trimmedName
  );

  const { data: insertedRaw, error: insertError } = await supabase
    .from("campaigns")
    .insert({
      organization_id: orgId,
      campaign_id: campaignDisplayId,
      name: trimmedName,
      client_id: source.client_id,
      client_name: source.client_name,
      description: source.description,
      industry: source.industry,
      geography: source.geography,
      target_designation: source.target_designation,
      lead_type: source.lead_type,
      campaign_type: source.campaign_type,
      start_date: source.start_date,
      end_date: source.end_date,
      status: "draft",
      cpl: source.cpl,
      revenue: source.revenue,
      booked: source.booked,
      total_allocation: source.total_allocation,
      post_qa: source.post_qa,
      achieved: null,
      pending_allocation: null,
      weekly_call: source.weekly_call,
      weekly_report: source.weekly_report,
      additional_comments: source.additional_comments,
      assigned_team_leader_id: null,
      employee_size: source.employee_size,
      revenue_size: source.revenue_size,
      abm: source.abm,
      seniority: source.seniority,
      job_function: source.job_function,
      creatives_url: source.creatives_url,
      campaign_questions: campaignQuestionsToDbValue(
        normalizeCampaignQuestions(source.campaign_questions)
      ),
      qualification_criteria: source.qualification_criteria ?? {},
      alert_config: source.alert_config ?? {},
      lead_aggregated: source.lead_aggregated,
      created_by: userId,
    } as never)
    .select("id, campaign_id, campaign_code")
    .single();

  if (insertError || !insertedRaw) {
    throw new Error(insertError?.message || "Failed to create duplicate campaign");
  }

  const inserted = insertedRaw as {
    id: string;
    campaign_id: string;
    campaign_code: string | null;
  };

  const { data: sourceFilesRaw, error: filesError } = await supabase
    .from("campaign_files")
    .select("id, file_name, file_path, file_size, mime_type")
    .eq("campaign_id", sourceCampaignId)
    .eq("organization_id", orgId);

  if (filesError) {
    throw new Error(filesError.message);
  }

  const sourceFiles = (sourceFilesRaw ?? []) as CampaignFileRow[];
  const fileErrors: string[] = [];
  let filesCopied = 0;

  if (sourceFiles.length > 0) {
    const admin = getAdminClientSafe();
    if (!admin) {
      fileErrors.push("Campaign files were not copied (admin storage client unavailable).");
    } else {
      for (const file of sourceFiles) {
        const safeName = sanitizeFileName(file.file_name);
        const newPath = `${orgId}/${inserted.id}/${crypto.randomUUID()}_${safeName}`;
        const { error: copyError } = await admin.storage
          .from(BUCKET)
          .copy(file.file_path, newPath);

        if (copyError) {
          fileErrors.push(`${file.file_name}: ${copyError.message}`);
          continue;
        }

        const { error: registerError } = await supabase.from("campaign_files").insert({
          campaign_id: inserted.id,
          organization_id: orgId,
          file_name: file.file_name,
          file_path: newPath,
          file_size: file.file_size,
          mime_type: file.mime_type,
          uploaded_by: userId,
        } as never);

        if (registerError) {
          fileErrors.push(`${file.file_name}: ${registerError.message}`);
          await admin.storage.from(BUCKET).remove([newPath]).catch(() => undefined);
          continue;
        }

        filesCopied += 1;
      }
    }
  }

  return {
    id: inserted.id,
    campaign_id: inserted.campaign_id,
    campaign_code: inserted.campaign_code,
    filesCopied,
    fileErrors,
  };
}
