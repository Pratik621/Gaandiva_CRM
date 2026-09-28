import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { logAuthEvent, getRequestMeta } from "@/lib/mfa/audit";
import { clearMfaSessionCookie } from "@/lib/mfa/session-cookie";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("roles(name)")
    .eq("user_id", user.id);

  const actorRoles = (roleRows ?? []).map(
    (r: { roles: { name: string } | null }) => r.roles?.name?.toLowerCase() ?? ""
  );
  const hasUsersAccess = actorRoles.some((role) => ["admin", "admin_support"].includes(role));
  if (!hasUsersAccess) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { error: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  return {
    adminUser: user,
    orgId,
    isAdminSupport: actorRoles.includes("admin_support") && !actorRoles.includes("admin"),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { adminUser, orgId, isAdminSupport } = auth as {
      adminUser: { id: string };
      orgId: string;
      isAdminSupport: boolean;
    };

    const { id: targetUserId } = await params;
    if (!targetUserId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { data: target, error: targetErr } = await admin
      .from("users")
      .select("id, organization_id")
      .eq("id", targetUserId)
      .single();

    if (targetErr || !target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if ((target as { organization_id: string }).organization_id !== orgId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (isAdminSupport) {
      const { data: targetRoles } = await admin
        .from("user_roles")
        .select("roles(name)")
        .eq("user_id", targetUserId);
      const targetIsAdmin = (targetRoles ?? []).some(
        (row: { roles: { name: string } | null }) => row.roles?.name?.toLowerCase() === "admin"
      );
      if (targetIsAdmin) {
        return NextResponse.json({ error: "Admin Support cannot manage Admin users" }, { status: 403 });
      }
    }

    // Remove email enrollment + backup codes
    await Promise.all([
      admin.from("user_mfa_enrollment").delete().eq("user_id", targetUserId),
      admin.from("mfa_backup_codes").delete().eq("user_id", targetUserId),
    ]);

    // Unenroll all TOTP factors via Admin API
    const { data: userData } = await admin.auth.admin.getUserById(targetUserId);
    const factors = userData.user?.factors ?? [];
    for (const factor of factors) {
      if (factor.status === "verified" || factor.status === "unverified") {
        await admin.auth.admin.mfa.deleteFactor({
          id: factor.id,
          userId: targetUserId,
        });
      }
    }

    const meta = getRequestMeta(request);
    await logAuthEvent(admin, {
      organizationId: orgId,
      userId: targetUserId,
      eventType: "mfa_admin_reset",
      channel: null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      metadata: { reset_by: adminUser.id },
    });

    const response = NextResponse.json({ ok: true });
    clearMfaSessionCookie(response);
    return response;
  } catch (err) {
    console.error("[admin/mfa-reset] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
