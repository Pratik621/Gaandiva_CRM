export type CampaignFeedPostType =
  | "text"
  | "announcement"
  | "question"
  | "update"
  | "file";

export type CampaignFeedAttachment = {
  path: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  downloadUrl?: string | null;
};

export type CampaignFeedReaction = {
  id: string;
  emoji: string;
  user_id: string;
  user?: CampaignFeedUser | null;
};

export type CampaignFeedUser = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role_label?: string | null;
};

export type CampaignFeedReply = {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  mentions: string[];
  attachments: CampaignFeedAttachment[];
  edited_at: string | null;
  created_at: string;
  user?: CampaignFeedUser | null;
  reactions?: CampaignFeedReaction[];
};

export type CampaignFeedPost = {
  id: string;
  campaign_id: string;
  user_id: string;
  post_type: CampaignFeedPostType;
  content: string;
  attachments: CampaignFeedAttachment[];
  mentions: string[];
  is_pinned: boolean;
  pinned_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  user?: CampaignFeedUser | null;
  reactions?: CampaignFeedReaction[];
  replies?: CampaignFeedReply[];
  reply_count?: number;
  lead_refs?: CampaignFeedLeadRef[];
};

export type CampaignFeedActivityEntry = {
  id: string;
  action: string;
  actor_id: string;
  actor?: CampaignFeedUser | null;
  feed_post_id: string | null;
  feed_reply_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type CampaignFeedMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role_label: string;
};

/** A lead snapshot stored inside a feed post's lead_refs array. */
export type CampaignFeedLeadRef = {
  id: string;
  name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

export const FEED_POST_TYPE_LABELS: Record<CampaignFeedPostType, string> = {
  text: "Post",
  announcement: "Announcement",
  question: "Question",
  update: "Update",
  file: "File",
};

export const FEED_FILTER_OPTIONS = [
  { value: "all", label: "All Posts" },
  { value: "announcement", label: "Announcements" },
  { value: "question", label: "Questions" },
  { value: "update", label: "Updates" },
  { value: "file", label: "Files" },
] as const;

export const FEED_EMOJI_OPTIONS = [
  // Approval & agreement
  "👍", "👎", "✅", "❌", "☑️", "💯",
  // Appreciation & celebration
  "❤️", "🙌", "👏", "🎉", "🏆", "🥇",
  // Urgency & action
  "🔥", "🚀", "⚡", "⏰", "🚨", "📌",
  // Emotions & reactions
  "😊", "😂", "😮", "😢", "🤔", "😅",
  // Work & productivity
  "💪", "🙏", "👀", "✍️", "📊", "💡",
  // Status signals
  "🔄", "⏳", "✔️", "📅", "🔖", "💬",
];

export const FEED_LIKE_EMOJI = "👍";
