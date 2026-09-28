import { NextResponse, type NextRequest } from "next/server";
import { verifyLeadFinderAccess } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  LEAD_LIST_COLUMNS,
  LEAD_SORTABLE_COLUMNS,
  applyLeadFilters,
} from "@/lib/lead-finder/query";

export const dynamic = "force-dynamic";

/** Scraped-leads list: server-side search/filter/sort/pagination (100k+ safe). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await verifyLeadFinderAccess();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId } = ctx as { orgId: string };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const sp = request.nextUrl.searchParams;
    const { page, limit, offset } = parseListPagination(sp, 25);
    const sortBy = LEAD_SORTABLE_COLUMNS.has(sp.get("sort") ?? "")
      ? (sp.get("sort") as string)
      : "created_at";
    const sortAsc = sp.get("dir") === "asc";

    let query = admin
      .from("lead_finder_leads")
      .select(LEAD_LIST_COLUMNS, { count: "exact" })
      .eq("organization_id", orgId);
    query = applyLeadFilters(query, sp);

    const { data, error, count } = await query
      .order(sortBy, { ascending: sortAsc })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Distinct batch names for the filter dropdown (from recent runs).
    const { data: batches } = await admin
      .from("lead_finder_runs")
      .select("batch_name")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    const batchOptions = [
      ...new Set(((batches ?? []) as { batch_name: string }[]).map((b) => b.batch_name)),
    ];

    return NextResponse.json({
      leads: data ?? [],
      batches: batchOptions,
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("Lead finder leads error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
