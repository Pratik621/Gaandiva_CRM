import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, queryLeadHistory, clampLimit, getProfile } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  guardClientViewerLead,
} from "@/lib/command/client-viewer-scope";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await getProfile(supabase, user.id);

  if (userRoles.includes("client_viewer")) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    const allowed = await guardClientViewerLead(supabase, scope, id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const sp = req.nextUrl.searchParams;
  const cursor = sp.get("cursor");
  const limit = clampLimit(sp.get("limit") ?? "50");

  try {
    const result = await queryLeadHistory(supabase, id, { limit, cursor });
    return NextResponse.json({
      history: result.items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
