export const ANNOUNCEMENT_TYPES = ["note", "warning", "alert", "poll"] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];

export const TARGET_MODES = ["role", "group", "user"] as const;
export type TargetMode = (typeof TARGET_MODES)[number];

export type PermissionScope = "org" | "team" | "audited_agents";

export type PermissionRule = {
  sender_role: string;
  target_role: string;
  allowed_types: AnnouncementType[];
  scope: PermissionScope;
};

export type AnnouncementTargeting = {
  mode: TargetMode;
  target_role: string;
  campaign_id?: string | null;
  user_ids?: string[];
};

export type CreateAnnouncementBody = {
  type: AnnouncementType;
  title: string;
  message?: string;
  targeting: AnnouncementTargeting;
  poll?: {
    options: string[];
    is_anonymous?: boolean;
    closes_at?: string | null;
  };
};

export type PollOptionResult = {
  id: string;
  option_text: string;
  sort_order: number;
  votes: number;
};

export type PollResults = {
  options: PollOptionResult[];
  total_votes: number;
};

export type AnnouncementInboxItem = {
  id: string;
  type: AnnouncementType;
  title: string;
  message: string;
  created_at: string;
  created_by_role: string;
  sender_name: string | null;
  is_anonymous: boolean;
  closes_at: string | null;
  is_closed: boolean;
  read_at: string | null;
  acknowledged_at: string | null;
  dismissed_at: string | null;
  poll_options: { id: string; option_text: string; sort_order: number }[] | null;
  my_vote_option_id: string | null;
  /** Aggregate results — only present when the viewer voted or the poll closed. */
  poll_results: PollResults | null;
};

export type AnnouncementInboxCounts = {
  unread: number;
  pending_ack: number;
  pending_votes: number;
};

export type SentAnnouncementItem = {
  id: string;
  type: AnnouncementType;
  title: string;
  created_at: string;
  closes_at: string | null;
  is_anonymous: boolean;
  target_summary: string;
  recipient_count: number;
  read_count: number;
  ack_count: number;
  vote_count: number;
};

export type AudiencePreview = {
  count: number;
  sample: { id: string; name: string }[];
};
