import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import { fetchPollBundle } from "@/lib/announcements/queries";
import type { AnnouncementType } from "@/lib/announcements/types";

export const dynamic = "force-dynamic";

/** Sender compliance view: per-recipient read/ack + poll results. */
export async function GET(
  request: NextRequest,
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

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Announcement ID required" }, { status: 400 });
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

    const { data: announcementRow } = await admin
      .from("announcements")
      .select("id, type, title, message, created_by, created_by_role, is_anonymous, closes_at, created_at")
      .eq("id", id)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!announcementRow) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 });
    }
    const announcement = announcementRow as {
      id: string;
      type: AnnouncementType;
      title: string;
      message: string;
      created_by: string;
      created_by_role: string;
      is_anonymous: boolean;
      closes_at: string | null;
      created_at: string;
    };

    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const isAdmin = roleNames.includes("admin");
    if (announcement.created_by !== user.id && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { page, limit, offset } = parseListPagination(request.nextUrl.searchParams, 25);

    const [{ data: targetRows }, recipientsRes] = await Promise.all([
      admin
        .from("announcement_targets")
        .select("target_type, target_role, campaign_id, user_id")
        .eq("announcement_id", id),
      admin
        .from("announcement_recipients")
        .select("user_id, read_at, acknowledged_at, dismissed_at", { count: "exact" })
        .eq("announcement_id", id)
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1),
    ]);

    if (recipientsRes.error) {
      return NextResponse.json({ error: recipientsRes.error.message }, { status: 500 });
    }

    type RecipientRow = {
      user_id: string;
      read_at: string | null;
      acknowledged_at: string | null;
      dismissed_at: string | null;
    };
    const recipientRows = (recipientsRes.data ?? []) as RecipientRow[];
    const total = recipientsRes.count ?? 0;

    // Whole-announcement tallies (separate head-counts; recipients can exceed a page).
    const [readCountRes, ackCountRes] = await Promise.all([
      admin
        .from("announcement_recipients")
        .select("user_id", { count: "exact", head: true })
        .eq("announcement_id", id)
        .not("read_at", "is", null),
      admin
        .from("announcement_recipients")
        .select("user_id", { count: "exact", head: true })
        .eq("announcement_id", id)
        .not("acknowledged_at", "is", null),
    ]);

    const recipientNames = await resolveUserDisplayNames(
      admin,
      recipientRows.map((r) => r.user_id)
    );

    let poll: {
      options: { id: string; option_text: string; votes: number }[];
      total_votes: number;
      voters: { name: string; option_text: string; voted_at: string }[] | null;
    } | null = null;

    if (announcement.type === "poll") {
      const bundle = await fetchPollBundle(admin, user.id, [id]);
      const results = bundle.resultsByAnnouncement.get(id);
      let voters: { name: string; option_text: string; voted_at: string }[] | null = null;

      // Named polls expose who voted for what; anonymous polls never do.
      if (!announcement.is_anonymous) {
        const { data: voteRows } = await admin
          .from("poll_votes")
          .select("user_id, poll_option_id, voted_at")
          .eq("announcement_id", id)
          .order("voted_at", { ascending: false });
        const votes = (voteRows ?? []) as {
          user_id: string;
          poll_option_id: string;
          voted_at: string;
        }[];
        const voterNames = await resolveUserDisplayNames(
          admin,
          votes.map((v) => v.user_id)
        );
        const optionText = new Map(
          (bundle.optionsByAnnouncement.get(id) ?? []).map((o) => [o.id, o.option_text])
        );
        voters = votes.map((v) => ({
          name: voterNames[v.user_id] ?? "Unknown",
          option_text: optionText.get(v.poll_option_id) ?? "—",
          voted_at: v.voted_at,
        }));
      }

      poll = {
        options: (results?.options ?? []).map((o) => ({
          id: o.id,
          option_text: o.option_text,
          votes: o.votes,
        })),
        total_votes: results?.total_votes ?? 0,
        voters,
      };
    }

    return NextResponse.json({
      announcement: {
        id: announcement.id,
        type: announcement.type,
        title: announcement.title,
        message: announcement.message,
        created_by_role: announcement.created_by_role,
        is_anonymous: announcement.is_anonymous,
        closes_at: announcement.closes_at,
        created_at: announcement.created_at,
      },
      targets: targetRows ?? [],
      recipient_count: total,
      read_count: readCountRes.count ?? 0,
      ack_count: ackCountRes.count ?? 0,
      recipients: recipientRows.map((r) => ({
        user_id: r.user_id,
        name: recipientNames[r.user_id] ?? "Unknown",
        read_at: r.read_at,
        acknowledged_at: r.acknowledged_at,
        dismissed_at: r.dismissed_at,
      })),
      pagination: buildPaginationMeta(page, limit, total),
      poll,
    });
  } catch (err) {
    console.error("Announcement stats error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
