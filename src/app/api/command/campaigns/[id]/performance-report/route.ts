import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { hasCommandRole } from "@/lib/command/rules-engine";
import { getProfile, getRoleNames } from "@/lib/command/db";
import {
  isCampaignReportMvpUser,
  canViewCampaignPerformanceReport,
  type CampaignPerformanceReportRow,
} from "@/lib/command/campaign-performance-report";

export const dynamic = "force-dynamic";

type CampaignAccessRow = {
  id: string;
  campaign_id: string;
  client_id: string | null;
  organization_id: string | null;
};

type ReportQueryClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string | boolean) => ReportFilterBuilder;
    };
  };
};

type ReportFilterBuilder = {
  eq: (column: string, value: string | boolean) => ReportFilterBuilder;
  order: (
    column: string,
    opts: { ascending: boolean }
  ) => {
    limit: (n: number) => {
      maybeSingle: () => Promise<{
        data: CampaignPerformanceReportRow | null;
        error: { message: string } | null;
      }>;
    };
  };
};

async function fetchLatestCompletedReport(
  admin: ReportQueryClient,
  campaignUuid: string,
  businessCampaignId: string | null
): Promise<{ report: CampaignPerformanceReportRow | null; error: string | null }> {
  const base = () =>
    admin
      .from("campaign_performance_reports")
      .select("*")
      .eq("status", "completed")
      .eq("is_web_vitals_saved", true);

  const byUuid = await base()
    .eq("crm_campaign_uuid", campaignUuid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byUuid.error) {
    return { report: null, error: byUuid.error.message };
  }
  if (byUuid.data) {
    return { report: byUuid.data, error: null };
  }

  if (businessCampaignId) {
    const byBusinessId = await base()
      .eq("crm_campaign_id", businessCampaignId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (byBusinessId.error) {
      return { report: null, error: byBusinessId.error.message };
    }
    return { report: byBusinessId.data, error: null };
  }

  return { report: null, error: null };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRoles = await getRoleNames(supabase, user.id);
    const email = user.email ?? null;
    const isMvpClient = isCampaignReportMvpUser(email);
    const canViewReport = canViewCampaignPerformanceReport(email, campaignId);
    const isInternal = hasCommandRole(userRoles);

    // Shlok MVP (all bound-client campaigns) + kstagnito emails (allowlisted campaigns) + internal.
    if (!canViewReport && !isInternal) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const profile = await getProfile(supabase, user.id);
    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, campaign_id, client_id, organization_id")
      .eq("id", campaignId)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const campaignRow = campaign as CampaignAccessRow;

    if (campaignRow.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // MVP Shlok: must match bound client. Other allowlisted emails are scoped by campaign UUID.
    if (isMvpClient && !isInternal) {
      const clientId = (profile as { client_id: string | null }).client_id;
      if (!clientId || campaignRow.client_id !== clientId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json(
        { error: ADMIN_NOT_CONFIGURED_MESSAGE },
        { status: 503 }
      );
    }

    const { report, error: reportError } = await fetchLatestCompletedReport(
      admin as unknown as ReportQueryClient,
      campaignId,
      campaignRow.campaign_id ?? null
    );

    if (reportError) {
      console.error("performance-report fetch error:", reportError);
      return NextResponse.json({ error: "Failed to load report" }, { status: 500 });
    }

    if (!report) {
      return NextResponse.json(
        { report: null, message: "Report not available yet" },
        { status: 200 }
      );
    }

    return NextResponse.json({ report });
  } catch (err) {
    console.error("performance-report error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
