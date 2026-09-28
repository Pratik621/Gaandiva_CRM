import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { fetchRecipientCounts, fetchVoteCounts } from "@/lib/announcements/queries";
import type { AnnouncementType, SentAnnouncementItem } from "@/lib/announcements/types";

export const dynamic = "force-dynamic";

type SentRow = {
  id: string;
  type: AnnouncementType;
  title: string;
  created_at: string;
  closes_at: string | null;
  is_anonymous: boolean;
  announcement_targets: {
    target_type: string;
    target_role: string | null;
    campaign_id: string | null;
    user_id: string | null;
  }[];
};

function summarizeTargets(targets: SentRow["announcement_targets"]): string {
  if (!targets || targets.length === 0) return "—";
  const first = targets[0];
  if (first.target_type === "user") {
    return targets.length === 1 ? "1 person" : `${targets.length} people`;
  }
  const role = (first.target_role ?? "").replace(/_/g, " ");
  if (first.target_type === "group") {
    return `${role} (campaign)`;
  }
  return `All ${role}s`;
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const admin = getAdminClientSafe();
    if (!admin) {
      return NextResponse.json({ error: ADMIN_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }

    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams);
    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isAdmin = roleNames.includes("admin");

    let query = admin
      .from("announcements")
      .select(
        "id, type, title, created_at, closes_at, is_anonymous, announcement_targets(target_type, target_role, campaign_id, user_id)",
        { count: "exact" }
      )
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    // Admins see the whole org's sent log; everyone else sees their own.
    if (!isAdmin) {
      query = query.eq("created_by", user.id);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as unknown as SentRow[];
    const ids = rows.map((r) => r.id);
    const pollIds = rows.filter((r) => r.type === "poll").map((r) => r.id);

    const [recipientCounts, voteCounts] = await Promise.all([
      fetchRecipientCounts(admin, ids),
      fetchVoteCounts(admin, pollIds),
    ]);

    const announcements: SentAnnouncementItem[] = rows.map((r) => {
      const stats = recipientCounts.get(r.id) ?? {
        recipient_count: 0,
        read_count: 0,
        ack_count: 0,
      };
      return {
        id: r.id,
        type: r.type,
        title: r.title,
        created_at: r.created_at,
        closes_at: r.closes_at,
        is_anonymous: r.is_anonymous,
        target_summary: summarizeTargets(r.announcement_targets),
        recipient_count: stats.recipient_count,
        read_count: stats.read_count,
        ack_count: stats.ack_count,
        vote_count: voteCounts.get(r.id) ?? 0,
      };
    });

    return NextResponse.json({
      announcements,
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("Announcements sent error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
