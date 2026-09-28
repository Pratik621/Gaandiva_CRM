/**
 * CORE API — Lead Status Change
 * Flow: validate role → rules engine → update leads → lead_history → alerts
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  processLeadStatusChange,
  hasCommandRole,
} from "@/lib/command/rules-engine";
import { getProfile, getRoleNames } from "@/lib/command/db";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);

  if (!hasCommandRole(userRoles)) {
    return NextResponse.json(
      { error: "Forbidden — requires internal_operator or higher" },
      { status: 403 }
    );
  }

  const profile = await getProfile(supabase, user.id);

  const body = await request.json() as {
    status: string;
    reason?: string;
    dq_override?: boolean;
  };

  if (!body.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const ipAddress =
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    undefined;

  const result = await processLeadStatusChange(
    {
      supabase,
      userId: user.id,
      userRoles,
      leadId: id,
      organizationId: profile?.organization_id ?? "",
      ipAddress,
    },
    {
      newStatus: body.status,
      reason: body.reason,
      dqOverride: body.dq_override,
    }
  );

  if (!result.allowed) {
    return NextResponse.json(
      { error: result.reason, code: result.code },
      { status: 422 }
    );
  }

  return NextResponse.json({
    success: true,
    alertsCreated: result.alertsCreated ?? [],
  });
}
