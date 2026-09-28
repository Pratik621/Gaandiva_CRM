import { NextResponse, type NextRequest } from "next/server";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPORT_CAP = 10_000;

type Tab = "activity" | "security" | "logins";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Unified audit trail for admins.
 * Tabs: activity (audit_logs) · security (auth_events: MFA/devices/IP) ·
 * logins (login_logs). ?format=csv exports the filtered set (capped).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await verifyOrgAdmin();
    if ("error" in ctx && ctx.error) return ctx.error;
    const { orgId } = ctx as { orgId: string };

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const sp = request.nextUrl.searchParams;
    const tab = (["activity", "security", "logins"].includes(sp.get("tab") ?? "")
      ? sp.get("tab")
      : "activity") as Tab;
    const isCsv = sp.get("format") === "csv";
    const { page, limit, offset } = parseListPagination(sp, 25);
    const category = sp.get("category")?.trim() || "";
    const q = sp.get("q")?.trim() || "";
    const dateFrom = sp.get("date_from")?.trim() || "";
    const dateTo = sp.get("date_to")?.trim() || "";

    const rangeStart = isCsv ? 0 : offset;
    const rangeEnd = isCsv ? EXPORT_CAP - 1 : offset + limit - 1;

    let rows: Record<string, unknown>[] = [];
    let total = 0;
    let userIdField = "actor_id";

    if (tab === "activity") {
      let query = admin
        .from("audit_logs")
        .select(
          "id, actor_id, actor_role, category, event_type, target_type, target_id, target_label, description, ip, metadata, created_at",
          { count: "exact" }
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (category) query = query.eq("category", category);
      if (q) {
        const safe = q.replace(/([%_,()])/g, "\\$1");
        query = query.or(
          `description.ilike.%${safe}%,event_type.ilike.%${safe}%,target_label.ilike.%${safe}%`
        );
      }
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);

      const { data, error, count } = await query.range(rangeStart, rangeEnd);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows = (data ?? []) as Record<string, unknown>[];
      total = count ?? 0;
    } else if (tab === "security") {
      let query = admin
        .from("auth_events")
        .select("id, user_id, event_type, channel, ip, user_agent, metadata, created_at", {
          count: "exact",
        })
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (q) {
        const safe = q.replace(/([%_,()])/g, "\\$1");
        query = query.ilike("event_type", `%${safe}%`);
      }
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);

      const { data, error, count } = await query.range(rangeStart, rangeEnd);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows = (data ?? []) as Record<string, unknown>[];
      total = count ?? 0;
      userIdField = "user_id";
    } else {
      // Logins: login_logs has no organization_id — scope via org user ids.
      const { data: orgUsers } = await admin
        .from("users")
        .select("id")
        .eq("organization_id", orgId);
      const orgUserIds = ((orgUsers ?? []) as { id: string }[]).map((u) => u.id);
      if (orgUserIds.length === 0) {
        return NextResponse.json({
          logs: [],
          pagination: buildPaginationMeta(page, limit, 0),
        });
      }

      let query = admin
        .from("login_logs")
        .select("id, user_id, ip_address, device_info, login_time", { count: "exact" })
        .in("user_id", orgUserIds)
        .order("login_time", { ascending: false });
      if (dateFrom) query = query.gte("login_time", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) query = query.lte("login_time", `${dateTo}T23:59:59.999Z`);

      const { data, error, count } = await query.range(rangeStart, rangeEnd);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...r,
        event_type: "login",
        created_at: r.login_time,
        ip: r.ip_address,
        user_agent: r.device_info,
      }));
      total = count ?? 0;
      userIdField = "user_id";
    }

    const actorIds = [
      ...new Set(
        rows.map((r) => r[userIdField]).filter((id): id is string => typeof id === "string")
      ),
    ];
    const names = actorIds.length > 0 ? await resolveUserDisplayNames(admin, actorIds) : {};
    const logs: Record<string, unknown>[] = rows.map((r) => ({
      ...r,
      actor_name:
        typeof r[userIdField] === "string" ? names[r[userIdField] as string] ?? null : null,
    }));

    if (isCsv) {
      const headers = ["created_at", "actor_name", "category", "event_type", "description", "target_label", "ip", "metadata"];
      const lines = [
        headers.join(","),
        ...logs.map((r) => headers.map((h) => csvEscape(r[h])).join(",")),
      ];
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      return new NextResponse(lines.join("\n"), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-${tab}-${ts}.csv"`,
        },
      });
    }

    return NextResponse.json({
      logs,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err) {
    console.error("Audit logs error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
