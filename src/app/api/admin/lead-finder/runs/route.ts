import { NextResponse, type NextRequest } from "next/server";
import { verifyLeadFinderAccess } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";

export const dynamic = "force-dynamic";

/** Run history (paginated), newest first. Admin only. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await verifyLeadFinderAccess();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId } = ctx as { orgId: string };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams);
    const { data, error, count } = await admin
      .from("lead_finder_runs")
      .select(
        "id, engine_run_id, dataset_id, filters, batch_name, status, total_found, inserted_count, updated_count, skipped_count, progress, error_message, started_by, created_at, finished_at",
        { count: "exact" }
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const runs = (data ?? []) as { started_by: string | null }[];
    const starterIds = [
      ...new Set(runs.map((r) => r.started_by).filter((id): id is string => Boolean(id))),
    ];
    const names = starterIds.length > 0 ? await resolveUserDisplayNames(admin, starterIds) : {};

    return NextResponse.json({
      runs: runs.map((r) => ({
        ...r,
        started_by_name: r.started_by ? names[r.started_by] ?? null : null,
      })),
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("Lead finder runs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
