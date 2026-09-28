import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasAdminOverrideRole, hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, resolveAlert } from "@/lib/command/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);

  const canResolve = hasCommandRole(userRoles) || hasAdminOverrideRole(userRoles);
  if (!canResolve) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json() as {
    resolution_note?: string;
    resolution_category?: string;
  };

  try {
    const alert = await resolveAlert(
      supabase,
      id,
      user.id,
      body.resolution_note ?? "",
      body.resolution_category ?? ""
    );
    return NextResponse.json({ alert });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
