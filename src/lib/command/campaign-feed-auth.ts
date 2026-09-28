import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile, getRoleNames } from "@/lib/command/db";
import { hasCampaignFeedRole } from "@/lib/command/campaign-feed-access";
import { assertCampaignFeedAccess } from "@/lib/command/campaign-feed";

export type FeedAuthContext =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      userId: string;
      orgId: string;
      roleNames: string[];
      clientId: string | null;
    };

export async function authorizeCampaignFeed(
  campaignId: string
): Promise<FeedAuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const roleNames = await getRoleNames(supabase, user.id);
  if (!hasCampaignFeedRole(roleNames)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  const profile = await getProfile(supabase, user.id);
  const orgId = profile?.organization_id ?? "";
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "No organization" }, { status: 400 }),
    };
  }

  const access = await assertCampaignFeedAccess(
    supabase,
    campaignId,
    orgId,
    roleNames,
    profile?.client_id ?? null,
    user.email
  );

  if (!access.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: access.error }, { status: access.status }),
    };
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    orgId,
    roleNames,
    clientId: profile?.client_id ?? null,
  };
}
