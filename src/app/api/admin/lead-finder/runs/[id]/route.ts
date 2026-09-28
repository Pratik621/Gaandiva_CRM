import { NextResponse } from "next/server";
import { verifyLeadFinderAccess } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { getActorRun, getDatasetItemCount } from "@/lib/lead-finder/lead-engine";

export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  engine_run_id: string | null;
  dataset_id: string | null;
  status: string;
  total_found: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  progress: number;
  error_message: string | null;
  batch_name: string;
  filters: Record<string, unknown>;
  created_at: string;
  finished_at: string | null;
};

const RUN_SELECT =
  "id, engine_run_id, dataset_id, status, total_found, inserted_count, updated_count, skipped_count, progress, error_message, batch_name, filters, created_at, finished_at";

/**
 * Run status for the frontend poller. While the engine run is RUNNING this
 * also syncs engine state into the row (SUCCEEDED → ready to import;
 * FAILED/ABORTED/TIMED-OUT → failed).
 */
export async function GET(
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
      .select(RUN_SELECT)
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    let run = data as RunRow;

    // Sync live engine state while the actor is still running.
    let engineStatus: string | null = null;
    if (run.status === "RUNNING" && run.engine_run_id) {
      try {
        const engineRun = await getActorRun(run.engine_run_id);
        engineStatus = engineRun.status;
        const updates: Record<string, unknown> = {};

        if (!run.dataset_id && engineRun.defaultDatasetId) {
          updates.dataset_id = engineRun.defaultDatasetId;
        }
        if (["FAILED", "ABORTED", "TIMED-OUT"].includes(engineRun.status)) {
          updates.status = engineRun.status === "FAILED" ? "FAILED" : "ABORTED";
          updates.error_message = `Search run ${engineRun.status.toLowerCase().replace("-", " ")}`;
          updates.finished_at = new Date().toISOString();
        }
        if (engineRun.status === "SUCCEEDED" && run.total_found === 0) {
          const datasetId = (updates.dataset_id as string) ?? run.dataset_id;
          if (datasetId) {
            const itemCount = await getDatasetItemCount(datasetId);
            if (itemCount !== null) updates.total_found = itemCount;
          }
        }

        if (Object.keys(updates).length > 0) {
          const { data: updated } = await admin
            .from("lead_finder_runs")
            .update(updates as never)
            .eq("id", run.id)
            .select(RUN_SELECT)
            .single();
          if (updated) run = updated as RunRow;
        }
      } catch (err) {
        console.warn("Lead finder engine status sync failed:", err);
      }
    }

    return NextResponse.json({
      run,
      engine_status: engineStatus,
      // Frontend triggers the import when the actor is done but import hasn't run.
      ready_to_import:
        run.status === "RUNNING" && engineStatus === "SUCCEEDED" && Boolean(run.dataset_id),
    });
  } catch (err) {
    console.error("Lead finder run status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
