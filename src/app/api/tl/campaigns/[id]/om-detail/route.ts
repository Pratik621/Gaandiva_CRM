import { NextResponse } from "next/server";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasTLAccess, hasOrgWideInsightsAccess } from "@/lib/auth/tl-access";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { fetchOmCampaignDetail } from "@/lib/tl/campaign-om-detail";

export const dynamic = "force-dynamic";

export type { OmCampaignDetailResponse } from "@/lib/tl/campaign-om-detail";

dayjs.extend(utc);
dayjs.extend(timezone);

function isValidTimeZone(tz: string | null): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function utcStartOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 00:00:00.000`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

function utcEndOfDayInTz(dateStr: string, tz: string): string {
  return dayjs.tz(`${dateStr} 23:59:59.999`, "YYYY-MM-DD HH:mm:ss.SSS", tz).utc().toISOString();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    if (!hasTLAccess(roleNames) && !hasOrgWideInsightsAccess(roleNames)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    const orgId = (profile as { organization_id: string | null } | null)?.organization_id;
    if (!orgId) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { id: campaignId } = await params;
    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID required" }, { status: 400 });
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const url = new URL(request.url);
    const tzParam = url.searchParams.get("tz");
    const appTz = isValidTimeZone(tzParam) ? tzParam : "UTC";
    const today = dayjs().tz(appTz).format("YYYY-MM-DD");
    const defaultStart = dayjs().tz(appTz).subtract(30, "day").format("YYYY-MM-DD");
    const startDate = url.searchParams.get("start_date") || defaultStart;
    const endDate = url.searchParams.get("end_date") || today;
    const startUtc = utcStartOfDayInTz(startDate, appTz);
    const endUtc = utcEndOfDayInTz(endDate, appTz);

    const detail = await fetchOmCampaignDetail(admin, {
      orgId,
      campaignId,
      startUtc,
      endUtc,
      startDate,
      endDate,
      appTz,
    });

    if (!detail) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err) {
    console.error("OM campaign detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
