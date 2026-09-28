import { NextResponse } from "next/server";
import { verifyLeadFinderAccess } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import type { AdminClient } from "@/lib/supabase/admin";
import { fetchDatasetItems, getDatasetItemCount } from "@/lib/lead-finder/lead-engine";
import { extractActorError, mapEngineItem } from "@/lib/lead-finder/mapping";
import { logAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";
/** Vercel function time budget; the loop stops well before this. */
export const maxDuration = 300;

const FETCH_PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 500;
/** Stop looping after this much wall time; frontend re-invokes with progress. */
const TIME_BUDGET_MS = 240_000;
/** Hard guard: 100k leads / 1k per page = 100 pages; leave generous headroom. */
const MAX_TOTAL_ITERATIONS = 400;

type RunRow = {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  batch_name: string;
  status: string;
  total_found: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  progress: number;
  import_iterations: number;
};

async function importPage(
  admin: AdminClient,
  run: RunRow,
  items: Record<string, unknown>[]
): Promise<{ inserted: number; updated: number; skipped: number }> {
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const mapped = items.map(mapEngineItem);

  // Dedupe on email (case-insensitive — emails are stored lowercased):
  // fetch which of this page's emails already exist, then split insert/update.
  const emails = [...new Set(mapped.map((m) => m.email).filter((e): e is string => Boolean(e)))];
  const existingByEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += INSERT_BATCH_SIZE) {
    const chunk = emails.slice(i, i + INSERT_BATCH_SIZE);
    const { data } = await admin
      .from("lead_finder_leads")
      .select("id, email")
      .eq("organization_id", run.organization_id)
      .in("email", chunk);
    for (const row of (data ?? []) as { id: string; email: string }[]) {
      existingByEmail.set(row.email, row.id);
    }
  }

  const seenInPage = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; lead: ReturnType<typeof mapEngineItem> }[] = [];

  for (const lead of mapped) {
    if (lead.email) {
      if (seenInPage.has(lead.email)) {
        skipped++;
        continue;
      }
      seenInPage.add(lead.email);
      const existingId = existingByEmail.get(lead.email);
      if (existingId) {
        toUpdate.push({ id: existingId, lead });
        continue;
      }
    }
    toInsert.push({
      ...lead,
      organization_id: run.organization_id,
      run_id: run.id,
      batch_name: run.batch_name,
    });
  }

  for (let i = 0; i < toInsert.length; i += INSERT_BATCH_SIZE) {
    const chunk = toInsert.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await admin.from("lead_finder_leads").insert(chunk as never);
    if (error) {
      // Unique-violation race (parallel import click): fall back to row-by-row.
      if (error.code === "23505") {
        for (const row of chunk) {
          const { error: rowError } = await admin
            .from("lead_finder_leads")
            .insert(row as never);
          if (rowError) skipped++;
          else inserted++;
        }
        continue;
      }
      throw new Error(error.message);
    }
    inserted += chunk.length;
  }

  // Existing rows: fill only missing/null fields — never overwrite good data.
  for (const { id, lead } of toUpdate) {
    const { data: existing } = await admin
      .from("lead_finder_leads")
      .select(
        "first_name, last_name, full_name, email_status, phone, mobile_number, job_title, seniority, linkedin_url, photo_url, company_name, company_website, company_linkedin, company_industry, company_size, company_location, contact_city, contact_state, contact_country"
      )
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      skipped++;
      continue;
    }
    const current = existing as Record<string, string | null>;
    const fills: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(lead)) {
      if (key === "raw_data" || key === "email" || value === null) continue;
      if (current[key] === null || current[key] === undefined || current[key] === "") {
        fills[key] = value;
      }
    }
    if (Object.keys(fills).length > 0) {
      fills.updated_at = new Date().toISOString();
      const { error } = await admin
        .from("lead_finder_leads")
        .update(fills as never)
        .eq("id", id);
      if (error) skipped++;
      else updated++;
    } else {
      skipped++;
    }
  }

  return { inserted, updated, skipped };
}

/**
 * Chunked, resumable dataset import. Processes pages until the time budget
 * runs out, persists progress on the run row, and returns { done: false } so
 * the frontend immediately re-invokes with the saved offset — safe for 100k
 * leads without hitting function timeouts. Guarded by MAX_TOTAL_ITERATIONS.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await verifyLeadFinderAccess();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId } = ctx as { orgId: string };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { id } = await params;
    const { data } = await admin
      .from("lead_finder_runs")
      .select(
        "id, organization_id, dataset_id, batch_name, status, total_found, inserted_count, updated_count, skipped_count, progress, import_iterations"
      )
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    const run = data as RunRow;

    if (run.status === "SUCCEEDED") {
      return NextResponse.json({ done: true, run });
    }
    if (!["RUNNING", "IMPORTING"].includes(run.status)) {
      return NextResponse.json(
        { error: `Run is ${run.status}; nothing to import` },
        { status: 400 }
      );
    }
    if (!run.dataset_id) {
      return NextResponse.json(
        { error: "Dataset not available yet — actor still running" },
        { status: 400 }
      );
    }
    if (run.import_iterations >= MAX_TOTAL_ITERATIONS) {
      await admin
        .from("lead_finder_runs")
        .update({
          status: "FAILED",
          error_message: "Import exceeded the maximum iteration guard",
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", run.id);
      return NextResponse.json({ error: "Max import iterations exceeded" }, { status: 500 });
    }

    if (run.status !== "IMPORTING") {
      const { error: markError } = await admin
        .from("lead_finder_runs")
        .update({ status: "IMPORTING" } as never)
        .eq("id", run.id);
      if (markError) {
        return NextResponse.json(
          { error: `Failed to mark run as importing: ${markError.message}` },
          { status: 500 }
        );
      }
    }
    if (run.total_found === 0) {
      const itemCount = await getDatasetItemCount(run.dataset_id);
      if (itemCount !== null) {
        run.total_found = itemCount;
        await admin
          .from("lead_finder_runs")
          .update({ total_found: itemCount } as never)
          .eq("id", run.id);
      }
    }

    const startedAt = Date.now();
    let offset = run.progress;
    let iterations = run.import_iterations;
    let done = false;

    while (Date.now() - startedAt < TIME_BUDGET_MS) {
      iterations++;
      const rawItems = await fetchDatasetItems(run.dataset_id, offset, FETCH_PAGE_SIZE);
      if (rawItems.length === 0) {
        done = true;
        break;
      }

      // Actor error items (e.g. plan restrictions) must fail the run loudly,
      // never be imported as blank leads.
      const errorItems = rawItems
        .map(extractActorError)
        .filter((e): e is string => Boolean(e));
      const items = rawItems.filter((item) => !extractActorError(item));

      if (items.length === 0 && errorItems.length > 0) {
        const actorError = errorItems[0];
        await admin
          .from("lead_finder_runs")
          .update({
            status: "FAILED",
            error_message: `Lead engine returned an error instead of leads: ${actorError}`,
            finished_at: new Date().toISOString(),
          } as never)
          .eq("id", run.id);
        return NextResponse.json(
          { error: `Lead engine error: ${actorError}` },
          { status: 502 }
        );
      }
      if (items.length === 0) {
        offset += rawItems.length;
        continue;
      }

      const counts = await importPage(admin, run, items);
      // Dataset offset advances by RAW page size (error items included).
      offset += rawItems.length;
      run.inserted_count += counts.inserted;
      run.updated_count += counts.updated;
      run.skipped_count += counts.skipped;

      await admin
        .from("lead_finder_runs")
        .update({
          progress: offset,
          inserted_count: run.inserted_count,
          updated_count: run.updated_count,
          skipped_count: run.skipped_count,
          import_iterations: iterations,
        } as never)
        .eq("id", run.id);

      if (rawItems.length < FETCH_PAGE_SIZE) {
        done = true;
        break;
      }
      if (iterations >= MAX_TOTAL_ITERATIONS) break;
    }

    if (done) {
      void logAudit({
        organizationId: orgId,
        actorId: (ctx as { user: { id: string } }).user.id,
        category: "lead_finder",
        eventType: "lead_finder_imported",
        description: `Imported "${run.batch_name}": ${run.inserted_count.toLocaleString()} new, ${run.updated_count.toLocaleString()} updated, ${run.skipped_count.toLocaleString()} skipped`,
        targetType: "lead_finder_run",
        targetId: run.id,
        targetLabel: run.batch_name,
        metadata: {
          inserted: run.inserted_count,
          updated: run.updated_count,
          skipped: run.skipped_count,
          total_found: run.total_found,
        },
      });

      const { error: finishError } = await admin
        .from("lead_finder_runs")
        .update({
          status: "SUCCEEDED",
          total_found: run.total_found > 0 ? run.total_found : offset,
          finished_at: new Date().toISOString(),
        } as never)
        .eq("id", run.id);
      if (finishError) {
        // A silent failure here would leave the run stuck in IMPORTING and
        // the frontend looping forever — surface it loudly instead.
        console.error("Lead finder finish update failed:", finishError.message);
        return NextResponse.json(
          { error: `Import finished but status update failed: ${finishError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      done,
      progress: offset,
      total_found: run.total_found,
      inserted_count: run.inserted_count,
      updated_count: run.updated_count,
      skipped_count: run.skipped_count,
    });
  } catch (err) {
    console.error("Lead finder import error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
