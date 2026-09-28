import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasAdminOverrideRole, hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, acknowledgeAlert } from "@/lib/command/db";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  const canAck = hasCommandRole(userRoles) || hasAdminOverrideRole(userRoles);
  if (!canAck) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const alert = await acknowledgeAlert(supabase, id, user.id);
    return NextResponse.json({ alert });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 400 }
    );
  }
}
