import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, type AdminClient } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";

// simplified_meta_sources has no RLS policies (the token must never reach the
// browser), so the /api/marketing/meta-sources routes check the role here and
// use the service role, always scoped to the caller's organization.
export async function authorizeMarketing(): Promise<
  { ok: true; admin: AdminClient; orgId: string; userId: string } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const roleNames = await fetchUserRoleNames(supabase, user.id);
  if (!roleNames.includes("sm_marketing") && !roleNames.includes("admin")) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
  if (!orgId) {
    return { ok: false, response: NextResponse.json({ error: "No organization" }, { status: 400 }) };
  }

  const admin = getAdminClientSafe();
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: "Service unavailable" }, { status: 503 }) };
  }

  return { ok: true, admin, orgId, userId: user.id };
}
