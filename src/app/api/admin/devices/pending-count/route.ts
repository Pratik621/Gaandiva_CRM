import { NextResponse } from "next/server";
import { verifyOrgAdmin } from "@/lib/devices/api-auth";

export const dynamic = "force-dynamic";

/** Lightweight pending count for sidebar badge. */
export async function GET() {
  try {
    const auth = await verifyOrgAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, supabase } = auth as Exclude<
      Awaited<ReturnType<typeof verifyOrgAdmin>>,
      { error: NextResponse }
    >;

    const { count } = await supabase
      .from("trusted_devices")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "pending");

    return NextResponse.json({ pending_count: count ?? 0 });
  } catch (err) {
    console.error("[admin/devices/pending-count] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
