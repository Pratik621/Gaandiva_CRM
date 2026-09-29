import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCallLogsClientSafe, CALL_LOGS_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/call-logs";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { buildPaginationMeta, clampPage } from "@/lib/api-pagination";
import { postgrestOrIlikeFilters } from "@/lib/postgrest-filter";
import { CDR_COLUMNS, CDR_EXPORT_PAGE_SIZE } from "@/lib/cdr";

export const dynamic = "force-dynamic";

const SEARCH_COLUMNS = ["src", "dst", "clid", "cnum", "cnam", "did", "disposition", "uniqueid", "dst_cnam"];
const SELECT = ["id", ...CDR_COLUMNS.map((c) => c.key)].join(", ");

/**
 * GET ?page&limit(<=1000)&q&from=YYYY-MM-DD&to=YYYY-MM-DD
 * The logged-in agent's imported CDR rows, newest first. Used by the table and export.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!roleNames.includes("agent")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const db = getCallLogsClientSafe();
    if (!db) {
      return NextResponse.json({ error: CALL_LOGS_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const params = request.nextUrl.searchParams;
    const page = clampPage(params.get("page"));
    const limitRaw = parseInt(params.get("limit") ?? "25", 10);
    const limit = Math.max(1, Math.min(CDR_EXPORT_PAGE_SIZE, Number.isNaN(limitRaw) ? 25 : limitRaw));
    const offset = (page - 1) * limit;

    let query = db
      .from("cdr_records")
      .select(SELECT, { count: "exact" })
      .eq("agent_id", user.id);

    const search = postgrestOrIlikeFilters(SEARCH_COLUMNS, params.get("q") ?? "");
    if (search) query = query.or(search);

    const from = params.get("from");
    const to = params.get("to");
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("calldate", `${from} 00:00:00`);
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("calldate", `${to} 23:59:59`);

    const { data, error, count } = await query
      .order("calldate", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("CDR list error:", error);
      const missingTable = /cdr_records/i.test(error.message ?? "") && /(exist|schema cache)/i.test(error.message ?? "");
      return NextResponse.json(
        {
          error: missingTable
            ? "Run supabase-call-logs/migrations/20260930000000_cdr_records.sql first"
            : "Failed to load call logs",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      records: data ?? [],
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("CDR list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
