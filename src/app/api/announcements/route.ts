import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClientSafe, ADMIN_NOT_CONFIGURED_MESSAGE } from "@/lib/supabase/admin";
import { fetchUserRoleNames } from "@/lib/auth/server-roles";
import { resolveUserDisplayNames } from "@/lib/campaign/team-leader-display";
import { buildPaginationMeta, parseListPagination } from "@/lib/api-pagination";
import {
  ANNOUNCEMENT_TYPES,
  TARGET_MODES,
  type AnnouncementInboxItem,
  type AnnouncementType,
  type CreateAnnouncementBody,
} from "@/lib/announcements/types";
import { fetchPermissionRulesForSender, findSendRule } from "@/lib/announcements/permissions";
import { resolveAudience } from "@/lib/announcements/audience";
import { fanOutAnnouncement } from "@/lib/announcements/fanout";
import { logAudit } from "@/lib/audit/log";
import { fetchPollBundle, isPollClosed } from "@/lib/announcements/queries";

export const dynamic = "force-dynamic";

const MAX_POLL_OPTIONS = 10;
const MIN_POLL_OPTIONS = 2;
const INBOX_COUNTS_CAP = 1000;

type RecipientRow = {
  announcement_id: string;
  read_at: string | null;
  acknowledged_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  announcements: {
    id: string;
    type: AnnouncementType;
    title: string;
    message: string;
    created_by: string;
    created_by_role: string;
    is_anonymous: boolean;
    closes_at: string | null;
    created_at: string;
  } | null;
};

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

    const sp = request.nextUrl.searchParams;
    const { page, limit, offset } = parseListPagination(sp);
    const typeFilter = sp.get("type")?.trim() || "";
    const statusFilter = sp.get("status")?.trim() || "all";

    let query = supabase
      .from("announcement_recipients")
      .select(
        "announcement_id, read_at, acknowledged_at, dismissed_at, created_at, announcements!inner(id, type, title, message, created_by, created_by_role, is_anonymous, closes_at, created_at)",
        { count: "exact" }
      )
      .eq("user_id", user.id)
      .is("announcements.deleted_at", null)
      .order("created_at", { ascending: false });

    if ((ANNOUNCEMENT_TYPES as readonly string[]).includes(typeFilter)) {
      query = query.eq("announcements.type", typeFilter);
    }
    if (statusFilter === "unread") {
      query = query.is("read_at", null).is("dismissed_at", null);
    } else if (statusFilter === "pending") {
      // Alerts awaiting acknowledgment (poll pending is computed client-side).
      query = query.is("acknowledged_at", null).is("dismissed_at", null);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data ?? []) as unknown as RecipientRow[]).filter((r) => r.announcements);
    const admin = getAdminClientSafe();

    const pollIds = rows
      .filter((r) => r.announcements!.type === "poll")
      .map((r) => r.announcement_id);

    const pollBundle = admin
      ? await fetchPollBundle(admin, user.id, pollIds)
      : {
          optionsByAnnouncement: new Map(),
          myVoteByAnnouncement: new Map(),
          resultsByAnnouncement: new Map(),
        };

    const senderIds = [...new Set(rows.map((r) => r.announcements!.created_by))];
    const senderNames = admin ? await resolveUserDisplayNames(admin, senderIds) : {};

    const announcements: AnnouncementInboxItem[] = rows.map((r) => {
      const a = r.announcements!;
      const closed = isPollClosed(a.closes_at);
      const myVote = pollBundle.myVoteByAnnouncement.get(a.id) ?? null;
      const canSeeResults = a.type === "poll" && (Boolean(myVote) || closed);
      return {
        id: a.id,
        type: a.type,
        title: a.title,
        message: a.message,
        created_at: a.created_at,
        created_by_role: a.created_by_role,
        sender_name: senderNames[a.created_by] ?? null,
        is_anonymous: a.is_anonymous,
        closes_at: a.closes_at,
        is_closed: closed,
        read_at: r.read_at,
        acknowledged_at: r.acknowledged_at,
        dismissed_at: r.dismissed_at,
        poll_options:
          a.type === "poll"
            ? (pollBundle.optionsByAnnouncement.get(a.id) ?? []).map(
                (o: { id: string; option_text: string; sort_order: number }) => ({
                  id: o.id,
                  option_text: o.option_text,
                  sort_order: o.sort_order,
                })
              )
            : null,
        my_vote_option_id: myVote,
        poll_results: canSeeResults
          ? pollBundle.resultsByAnnouncement.get(a.id) ?? null
          : null,
      };
    });

    // Inbox-wide counts (capped — per-user inboxes are small).
    const { data: countRows } = await supabase
      .from("announcement_recipients")
      .select(
        "announcement_id, read_at, acknowledged_at, dismissed_at, announcements!inner(type, closes_at, deleted_at)"
      )
      .eq("user_id", user.id)
      .is("announcements.deleted_at", null)
      .is("dismissed_at", null)
      .limit(INBOX_COUNTS_CAP);

    type CountRow = {
      announcement_id: string;
      read_at: string | null;
      acknowledged_at: string | null;
      announcements: { type: AnnouncementType; closes_at: string | null } | null;
    };
    const countList = ((countRows ?? []) as unknown as CountRow[]).filter((r) => r.announcements);
    const openPollIds = countList
      .filter((r) => r.announcements!.type === "poll" && !isPollClosed(r.announcements!.closes_at))
      .map((r) => r.announcement_id);

    let votedPollIds = new Set<string>();
    if (openPollIds.length > 0) {
      const { data: myVotes } = await supabase
        .from("poll_votes")
        .select("announcement_id")
        .eq("user_id", user.id)
        .in("announcement_id", openPollIds);
      votedPollIds = new Set(
        ((myVotes ?? []) as { announcement_id: string }[]).map((v) => v.announcement_id)
      );
    }

    const counts = {
      unread: countList.filter((r) => !r.read_at).length,
      pending_ack: countList.filter(
        (r) => r.announcements!.type === "alert" && !r.acknowledged_at
      ).length,
      pending_votes: openPollIds.filter((id) => !votedPollIds.has(id)).length,
    };

    return NextResponse.json({
      announcements,
      counts,
      pagination: buildPaginationMeta(page, limit, count ?? 0),
    });
  } catch (err) {
    console.error("Announcements inbox error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = (await request.json().catch(() => null)) as CreateAnnouncementBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const type = body.type;
    if (!(ANNOUNCEMENT_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: "Invalid announcement type" }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }
    const message = typeof body.message === "string" ? body.message.trim() : "";

    const targeting = body.targeting;
    if (
      !targeting ||
      !(TARGET_MODES as readonly string[]).includes(targeting.mode) ||
      typeof targeting.target_role !== "string" ||
      !targeting.target_role.trim()
    ) {
      return NextResponse.json({ error: "Invalid targeting" }, { status: 400 });
    }
    if (targeting.mode === "group" && !targeting.campaign_id) {
      return NextResponse.json(
        { error: "campaign_id is required for group targeting" },
        { status: 400 }
      );
    }
    if (
      targeting.mode === "user" &&
      (!Array.isArray(targeting.user_ids) || targeting.user_ids.length === 0)
    ) {
      return NextResponse.json(
        { error: "user_ids is required for individual targeting" },
        { status: 400 }
      );
    }

    // Poll validation
    let pollOptions: string[] = [];
    let isAnonymous = false;
    let closesAt: string | null = null;
    if (type === "poll") {
      pollOptions = (body.poll?.options ?? [])
        .map((o) => (typeof o === "string" ? o.trim() : ""))
        .filter(Boolean);
      if (pollOptions.length < MIN_POLL_OPTIONS || pollOptions.length > MAX_POLL_OPTIONS) {
        return NextResponse.json(
          { error: `Polls need ${MIN_POLL_OPTIONS}-${MAX_POLL_OPTIONS} options` },
          { status: 400 }
        );
      }
      isAnonymous = Boolean(body.poll?.is_anonymous);
      if (body.poll?.closes_at) {
        const ts = new Date(body.poll.closes_at);
        if (Number.isNaN(ts.getTime()) || ts.getTime() <= Date.now()) {
          return NextResponse.json(
            { error: "Poll close time must be in the future" },
            { status: 400 }
          );
        }
        closesAt = ts.toISOString();
      }
    }

    // Permission matrix — server-side enforcement.
    const roleNames = await fetchUserRoleNames(supabase, user.id);
    const rules = await fetchPermissionRulesForSender(admin, orgId, roleNames);
    const rule = findSendRule(rules, { type, targetRole: targeting.target_role });
    if (!rule) {
      return NextResponse.json(
        { error: "You are not allowed to send this announcement type to that role" },
        { status: 403 }
      );
    }

    const recipientIds = await resolveAudience(admin, orgId, { id: user.id }, rule, targeting);
    if (recipientIds.length === 0) {
      return NextResponse.json(
        { error: "The selected audience has no recipients" },
        { status: 400 }
      );
    }

    const { data: inserted, error: insertError } = await admin
      .from("announcements")
      .insert({
        organization_id: orgId,
        type,
        title,
        message,
        created_by: user.id,
        created_by_role: rule.sender_role,
        is_anonymous: isAnonymous,
        closes_at: closesAt,
      } as never)
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? "Failed to create announcement" },
        { status: 500 }
      );
    }
    const announcementId = (inserted as { id: string }).id;

    // Record targeting intent (audit/display).
    const targetRows =
      targeting.mode === "user"
        ? [...new Set(targeting.user_ids ?? [])].map((userId) => ({
            announcement_id: announcementId,
            organization_id: orgId,
            target_type: "user",
            target_role: null,
            campaign_id: null,
            user_id: userId,
          }))
        : [
            {
              announcement_id: announcementId,
              organization_id: orgId,
              target_type: targeting.mode,
              target_role: targeting.target_role,
              campaign_id: targeting.mode === "group" ? targeting.campaign_id ?? null : null,
              user_id: null,
            },
          ];
    const { error: targetsError } = await admin
      .from("announcement_targets")
      .insert(targetRows as never);
    if (targetsError) {
      console.error("[announcements] targets insert failed:", targetsError.message);
    }

    if (type === "poll") {
      const { error: optionsError } = await admin.from("poll_options").insert(
        pollOptions.map((option_text, index) => ({
          announcement_id: announcementId,
          organization_id: orgId,
          option_text,
          sort_order: index,
        })) as never
      );
      if (optionsError) {
        return NextResponse.json({ error: optionsError.message }, { status: 500 });
      }
    }

    const { error: fanoutError } = await fanOutAnnouncement(admin, {
      announcement: {
        id: announcementId,
        organization_id: orgId,
        type,
        title,
        message,
        created_by: user.id,
      },
      recipientIds,
    });
    if (fanoutError) {
      return NextResponse.json({ error: fanoutError }, { status: 500 });
    }

    void logAudit({
      organizationId: orgId,
      actorId: user.id,
      actorRole: rule.sender_role,
      category: "announcements",
      eventType: `announcement_${type}_sent`,
      description: `Sent ${type} "${title}" to ${recipientIds.length} ${targeting.target_role}(s)`,
      targetType: "announcement",
      targetId: announcementId,
      targetLabel: title,
      metadata: {
        type,
        target_role: targeting.target_role,
        mode: targeting.mode,
        recipient_count: recipientIds.length,
      },
      request,
    });

    return NextResponse.json(
      { id: announcementId, recipient_count: recipientIds.length },
      { status: 201 }
    );
  } catch (err) {
    console.error("Announcements create error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
