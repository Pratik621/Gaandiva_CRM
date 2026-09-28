import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import {
  campaignTrackerRowToExportRecord,
  loadCampaignTrackerData,
  parseCampaignTrackerFilters,
} from "@/lib/campaign-tracker/query";

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

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id);
    const roleNames = ((roleRows ?? []) as { roles: { name: string } | null }[]).map((r) =>
      r.roles?.name?.toLowerCase().trim().replace(/\s+/g, "_")
    );
    const canView = roleNames.includes("mis") || roleNames.includes("admin");
    if (!canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const format = (request.nextUrl.searchParams.get("format") ?? "csv").toLowerCase();
    if (!["csv", "excel"].includes(format)) {
      return NextResponse.json({ error: "Invalid format, use csv or excel" }, { status: 400 });
    }

    const filters = parseCampaignTrackerFilters(request.nextUrl.searchParams);
    const result = await loadCampaignTrackerData(admin, orgId, filters);
    const exportRows = result.clients
      .flatMap((g) => g.campaigns)
      .slice(0, EXPORT_MAX_ROWS)
      .map(campaignTrackerRowToExportRecord);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "excel") {
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Campaign Tracker");
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new NextResponse(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="campaign-tracker-${stamp}.xlsx"`,
        },
      });
    }

    const csv = toCsv(exportRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="campaign-tracker-${stamp}.csv"`,
      },
    });
  } catch (err) {
    console.error("MIS campaign tracker export error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
