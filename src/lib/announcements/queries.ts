import type { AdminClient } from "@/lib/supabase/admin";
import type { PollResults } from "@/lib/announcements/types";

export type PollOptionRow = {
  id: string;
  announcement_id: string;
  option_text: string;
  sort_order: number;
};

/**
 * Poll data for a page of announcements in one round-trip per table (no N+1):
 * options, the viewer's votes, and aggregate results.
 */
export async function fetchPollBundle(
  admin: AdminClient,
  userId: string,
  pollAnnouncementIds: string[]
): Promise<{
  optionsByAnnouncement: Map<string, PollOptionRow[]>;
  myVoteByAnnouncement: Map<string, string>;
  resultsByAnnouncement: Map<string, PollResults>;
}> {
  const optionsByAnnouncement = new Map<string, PollOptionRow[]>();
  const myVoteByAnnouncement = new Map<string, string>();
  const resultsByAnnouncement = new Map<string, PollResults>();
  if (pollAnnouncementIds.length === 0) {
    return { optionsByAnnouncement, myVoteByAnnouncement, resultsByAnnouncement };
  }

  const [{ data: optionRows }, { data: voteRows }] = await Promise.all([
    admin
      .from("poll_options")
      .select("id, announcement_id, option_text, sort_order")
      .in("announcement_id", pollAnnouncementIds)
      .order("sort_order", { ascending: true }),
    admin
      .from("poll_votes")
      .select("announcement_id, poll_option_id, user_id")
      .in("announcement_id", pollAnnouncementIds),
  ]);

  for (const row of (optionRows ?? []) as PollOptionRow[]) {
    const list = optionsByAnnouncement.get(row.announcement_id) ?? [];
    list.push(row);
    optionsByAnnouncement.set(row.announcement_id, list);
  }

  const votes = (voteRows ?? []) as {
    announcement_id: string;
    poll_option_id: string;
    user_id: string;
  }[];

  const countsByOption = new Map<string, number>();
  for (const vote of votes) {
    countsByOption.set(vote.poll_option_id, (countsByOption.get(vote.poll_option_id) ?? 0) + 1);
    if (vote.user_id === userId) {
      myVoteByAnnouncement.set(vote.announcement_id, vote.poll_option_id);
    }
  }

  for (const [announcementId, options] of optionsByAnnouncement) {
    const optionResults = options.map((o) => ({
      id: o.id,
      option_text: o.option_text,
      sort_order: o.sort_order,
      votes: countsByOption.get(o.id) ?? 0,
    }));
    resultsByAnnouncement.set(announcementId, {
      options: optionResults,
      total_votes: optionResults.reduce((sum, o) => sum + o.votes, 0),
    });
  }

  return { optionsByAnnouncement, myVoteByAnnouncement, resultsByAnnouncement };
}

export type RecipientStatCounts = {
  recipient_count: number;
  read_count: number;
  ack_count: number;
};

/** Read/ack tallies per announcement for a page of sent announcements. */
export async function fetchRecipientCounts(
  admin: AdminClient,
  announcementIds: string[]
): Promise<Map<string, RecipientStatCounts>> {
  const byAnnouncement = new Map<string, RecipientStatCounts>();
  if (announcementIds.length === 0) return byAnnouncement;

  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from("announcement_recipients")
      .select("announcement_id, read_at, acknowledged_at")
      .in("announcement_id", announcementIds)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[announcements] recipient counts fetch failed:", error.message);
      break;
    }
    const rows = (data ?? []) as {
      announcement_id: string;
      read_at: string | null;
      acknowledged_at: string | null;
    }[];
    for (const row of rows) {
      const entry =
        byAnnouncement.get(row.announcement_id) ??
        ({ recipient_count: 0, read_count: 0, ack_count: 0 } as RecipientStatCounts);
      entry.recipient_count += 1;
      if (row.read_at) entry.read_count += 1;
      if (row.acknowledged_at) entry.ack_count += 1;
      byAnnouncement.set(row.announcement_id, entry);
    }
    if (rows.length < PAGE) break;
  }

  return byAnnouncement;
}

/** Vote totals per announcement for a page of sent polls. */
export async function fetchVoteCounts(
  admin: AdminClient,
  pollAnnouncementIds: string[]
): Promise<Map<string, number>> {
  const byAnnouncement = new Map<string, number>();
  if (pollAnnouncementIds.length === 0) return byAnnouncement;

  const { data } = await admin
    .from("poll_votes")
    .select("announcement_id")
    .in("announcement_id", pollAnnouncementIds);

  for (const row of (data ?? []) as { announcement_id: string }[]) {
    byAnnouncement.set(row.announcement_id, (byAnnouncement.get(row.announcement_id) ?? 0) + 1);
  }
  return byAnnouncement;
}

export function isPollClosed(closesAt: string | null): boolean {
  return Boolean(closesAt && new Date(closesAt).getTime() <= Date.now());
}
