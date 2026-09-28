import { NextResponse } from "next/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";
import { normalizeRoleName } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await verifyOrgAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as Exclude<
      Awaited<ReturnType<typeof verifyOrgAdmin>>,
      { error: NextResponse }
    >;
    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const userId = url.searchParams.get("userId");
    const role = url.searchParams.get("role");
    const q = url.searchParams.get("q")?.trim();

    let query = admin
      .from("trusted_devices")
      .select(
        "id, user_id, device_name, browser, os, ip_at_registration, location_approx, status, approved_at, approved_by, revoked_at, last_seen_at, created_at, last_notified_at"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (status && ["pending", "approved", "revoked"].includes(status)) {
      query = query.eq("status", status);
    }
    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: devices, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (devices ?? []) as Array<{
      id: string;
      user_id: string;
      device_name: string;
      browser: string | null;
      os: string | null;
      ip_at_registration: string | null;
      location_approx: string | null;
      status: string;
      approved_at: string | null;
      approved_by: string | null;
      revoked_at: string | null;
      last_seen_at: string | null;
      created_at: string;
      last_notified_at: string | null;
    }>;

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    let userMap = new Map<
      string,
      { full_name: string | null; email: string | null; roles: string[] }
    >();

    if (userIds.length > 0) {
      const [{ data: users }, { data: roleRows }] = await Promise.all([
        admin.from("users").select("id, full_name, email").in("id", userIds),
        admin.from("user_roles").select("user_id, roles(name)").in("user_id", userIds),
      ]);

      const rolesByUser = new Map<string, string[]>();
      for (const rr of roleRows ?? []) {
        const r = rr as { user_id: string; roles: { name: string } | null };
        const name = normalizeRoleName(r.roles?.name);
        if (!name) continue;
        const list = rolesByUser.get(r.user_id) ?? [];
        list.push(name);
        rolesByUser.set(r.user_id, list);
      }

      userMap = new Map(
        ((users ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
          (u) => [
            u.id,
            {
              full_name: u.full_name,
              email: u.email,
              roles: rolesByUser.get(u.id) ?? [],
            },
          ]
        )
      );
    }

    let enriched = rows.map((d) => {
      const u = userMap.get(d.user_id);
      return {
        ...d,
        user_name: u?.full_name ?? u?.email ?? "Unknown",
        user_email: u?.email ?? null,
        user_roles: u?.roles ?? [],
      };
    });

    if (role) {
      const want = normalizeRoleName(role);
      enriched = enriched.filter((d) => d.user_roles.includes(want));
    }
    if (q) {
      const needle = q.toLowerCase();
      enriched = enriched.filter(
        (d) =>
          d.user_name.toLowerCase().includes(needle) ||
          (d.user_email ?? "").toLowerCase().includes(needle) ||
          d.device_name.toLowerCase().includes(needle)
      );
    }

    // Pending first
    enriched.sort((a, b) => {
      if (a.status === "pending" && b.status !== "pending") return -1;
      if (b.status === "pending" && a.status !== "pending") return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const { count: pendingCount } = await admin
      .from("trusted_devices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "pending");

    return NextResponse.json({
      devices: enriched,
      pending_count: pendingCount ?? 0,
    });
  } catch (err) {
    console.error("[admin/devices] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
