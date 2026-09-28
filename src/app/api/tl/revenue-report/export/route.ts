import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import {
  applyRevenueReportChannelFilter,
  canAccessRevenueReport,
  fetchRevenueReportRows,
  parseRevenueReportFilters,
  resolveRevenueReportCampaignIds,
  revenueRowToExportRecord,
  sortRevenueReportRows,
} from "@/lib/revenue-report/query";

export const dynamic = "force-dynamic";

const EXPORT_MAX_ROWS = 5000;

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

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
    if (!canAccessRevenueReport(roleNames)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id, client_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null; client_id: string | null } | null)
      ?.organization_id;
    const clientId = (profile as { client_id: string | null } | null)?.client_id ?? null;

    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const format = (request.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
    if (!["csv", "excel"].includes(format)) {
      return NextResponse.json({ error: "Invalid format, use csv or excel" }, { status: 400 });
    }

    const filters = parseRevenueReportFilters(request.nextUrl.searchParams);
    const campaignIds = await resolveRevenueReportCampaignIds(
      supabase,
      orgId,
      user.id,
      roleNames,
      clientId,
      filters
    );

    const limitedIds = campaignIds.slice(0, EXPORT_MAX_ROWS);
    const { rows } = await fetchRevenueReportRows(supabase, orgId, limitedIds, {
      date_from: filters.date_from!,
      date_to: filters.date_to!,
      activityOnly: true,
    });
    const exportRows = sortRevenueReportRows(
      applyRevenueReportChannelFilter(rows, filters.channel),
      filters.sort_by,
      filters.sort_dir ?? "desc"
    ).map(revenueRowToExportRecord);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "excel") {
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Revenue Report");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="revenue-report-${stamp}.xlsx"`,
        },
      });
    }

    const csv = toCsv(exportRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="revenue-report-${stamp}.csv"`,
      },
    });
  } catch (err) {
    console.error("Revenue report export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
