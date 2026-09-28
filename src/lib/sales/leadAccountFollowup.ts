import type { SupabaseClient } from "@supabase/supabase-js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { createNotification } from "@/lib/notifications";

dayjs.extend(relativeTime);

export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export async function findAccountIdByCompanyInOrg(
  admin: SupabaseClient,
  orgId: string,
  companyName: string
): Promise<string | null> {
  const norm = normalizeCompanyName(companyName);
  if (!norm) return null;

  const { data: orgUsers } = await admin.from("users").select("id").eq("organization_id", orgId);
  const ownerIds = (orgUsers ?? []).map((u: { id: string }) => u.id);
  if (!ownerIds.length) return null;

  const { data: accounts } = await admin
    .from("accounts")
    .select("id, company_name")
    .in("owner_id", ownerIds);

  const match = (accounts ?? []).find(
    (a: { company_name: string | null }) =>
      normalizeCompanyName(a.company_name ?? "") === norm
  );
  return match?.id ?? null;
}

export async function createAccountFromLead(
  admin: SupabaseClient,
  ownerUserId: string,
  displayName: string,
  lead: {
    industry?: string | null;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
  }
): Promise<string> {
  const { data, error } = await admin
    .from("accounts")
    .insert({
      company_name: displayName.trim().replace(/\s+/g, " "),
      industry: lead.industry ?? null,
      website: lead.website ?? null,
      phone: lead.phone ?? null,
      address: lead.address ?? null,
      owner_id: ownerUserId,
    } as never)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create account");
  }
  return (data as { id: string }).id;
}

/** Resolve or create a single account for the company name (dedupe within org by normalized name). */
export async function ensureAccountForLeadRecord(
  admin: SupabaseClient,
  orgId: string,
  ownerUserId: string,
  companyName: string | null | undefined,
  lead: {
    industry?: string | null;
    website?: string | null;
    phone?: string | null;
    address?: string | null;
  }
): Promise<string | null> {
  const raw = (companyName ?? "").trim();
  if (!raw) return null;

  const existing = await findAccountIdByCompanyInOrg(admin, orgId, raw);
  if (existing) return existing;

  return createAccountFromLead(admin, ownerUserId, raw, lead);
}

function formatDueParts(dueIso: string): { absolute: string; relative: string } {
  const d = dayjs(dueIso);
  const absolute = d.format("MMM D, YYYY h:mm A");
  const relative = d.fromNow();
  return { absolute, relative };
}

export async function syncLeadFollowupTask(
  admin: SupabaseClient,
  orgId: string,
  opts: {
    leadId: string;
    leadName: string;
    companyName: string | null;
    followupType: string | null;
    nextFollowupIso: string | null;
    assignedAgentId: string;
    previousTaskId: string | null;
    actorUserId: string;
  }
): Promise<void> {
  const {
    leadId,
    leadName,
    companyName,
    followupType,
    nextFollowupIso,
    assignedAgentId,
    previousTaskId,
    actorUserId,
  } = opts;

  const titleBase = leadName || companyName || "Lead";

  if (!nextFollowupIso) {
    if (previousTaskId) {
      await admin.from("tasks").delete().eq("id", previousTaskId);
      await admin
        .from("sales_leads")
        .update({ followup_task_id: null } as never)
        .eq("id", leadId);
    }
    return;
  }

  const dueDate = nextFollowupIso;
  const taskTitle = `Follow up: ${titleBase}`;
  const taskDesc = [companyName ? `Company: ${companyName}` : null, followupType ? `Type: ${followupType}` : null]
    .filter(Boolean)
    .join("\n");

  let taskId = previousTaskId ?? null;
  let previousDue: string | null = null;

  if (taskId) {
    const { data: existing } = await admin.from("tasks").select("id, due_date").eq("id", taskId).maybeSingle();
    if (!existing) {
      taskId = null;
    } else {
      previousDue = (existing as { due_date: string | null }).due_date ?? null;
    }
  }

  if (taskId) {
    await admin
      .from("tasks")
      .update({
        title: taskTitle,
        description: taskDesc || null,
        due_date: dueDate,
        assigned_to: assignedAgentId,
        related_type: "lead",
        related_id: leadId,
        organization_id: orgId,
      } as never)
      .eq("id", taskId);
  } else {
    const { data: inserted, error } = await admin
      .from("tasks")
      .insert({
        title: taskTitle,
        description: taskDesc || null,
        related_type: "lead",
        related_id: leadId,
        due_date: dueDate,
        priority: "medium",
        status: "pending",
        assigned_to: assignedAgentId,
        created_by: actorUserId,
        organization_id: orgId,
      } as never)
      .select("id")
      .single();

    if (error || !inserted) {
      console.error("[syncLeadFollowupTask] insert task failed:", error?.message);
      return;
    }
    taskId = (inserted as { id: string }).id;
    await admin.from("sales_leads").update({ followup_task_id: taskId } as never).eq("id", leadId);
  }

  const notify =
    !previousTaskId ||
    !previousDue ||
    new Date(previousDue).getTime() !== new Date(dueDate).getTime();

  if (!notify || !taskId) return;

  const { absolute, relative } = formatDueParts(dueDate);
  const msg = `${titleBase}${companyName ? ` · ${companyName}` : ""} — ${absolute} · ${relative}`;

  void createNotification({
    title: "Follow-up scheduled",
    message: msg,
    type: "followup",
    sender_id: actorUserId,
    receiver_id: assignedAgentId,
    reference_type: "task",
    reference_id: taskId,
    organization_id: orgId,
  });
}
