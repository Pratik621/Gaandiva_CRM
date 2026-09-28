import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getRoleNames, getProfile } from "@/lib/command/db";
import {
  buildClientViewerCampaignScope,
  applyClientViewerLeadScope,
} from "@/lib/command/client-viewer-scope";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userRoles = await getRoleNames(supabase, user.id);
  if (!hasCommandRole(userRoles) && !userRoles.includes("client_viewer")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await getProfile(supabase, user.id);

  let query = supabase
    .from("leads")
    .select("*, campaigns(id, name, campaign_id, status, client_id, client_name, campaign_questions)")
    .eq("id", id);

  if (userRoles.includes("client_viewer")) {
    const scope = buildClientViewerCampaignScope(user.email, profile?.client_id ?? null);
    query = applyClientViewerLeadScope(query, scope, { joinOnCampaigns: true });
  }

  const { data: lead, error } = await query.single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  return NextResponse.json({ lead });
}
