"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Dropdown,
  Input,
  Modal,
  Popover,
  Space,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileOutlined,
  MessageOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PushpinFilled,
  PushpinOutlined,
  SmileOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import type {
  CampaignFeedAttachment,
  CampaignFeedLeadRef,
  CampaignFeedMember,
  CampaignFeedPost,
  CampaignFeedReply,
} from "@/lib/command/campaign-feed-types";
import { FEED_EMOJI_OPTIONS } from "@/lib/command/campaign-feed-types";
import {
  FeedPostTypeTag,
  FeedTimestamp,
  FeedUserAvatar,
  groupReactions,
  renderFeedContent,
} from "./feed-utils";

const { Text } = Typography;
const { TextArea } = Input;

const STATUS_TAG_STYLE: Record<string, { background: string; color: string; border: string }> = {
  qualified:     { background: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
  new:           { background: "#ede9fe", color: "#5b21b6", border: "#c4b5fd" },
  contacted:     { background: "#cffafe", color: "#0e7490", border: "#a5f3fc" },
  disqualified:  { background: "#fee2e2", color: "#b91c1c", border: "#fca5a5" },
  converted:     { background: "#f3e8ff", color: "#6d28d9", border: "#d8b4fe" },
  closed:        { background: "#f3f4f6", color: "#4b5563", border: "#d1d5db" },
};

function leadStatusStyle(s: string) {
  return STATUS_TAG_STYLE[s?.toLowerCase()] ?? { background: "#f3f4f6", color: "#4b5563", border: "#d1d5db" };
}

function LeadRefsSection({ leads }: { leads: CampaignFeedLeadRef[] }) {
  const [detailLead, setDetailLead] = useState<CampaignFeedLeadRef | null>(null);

  if (!leads.length) return null;

  return (
    <>
      <div
        style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "#faf5ff",
          borderRadius: 10,
          border: "1px solid #e9d5ff",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
            fontSize: 12,
            color: "#7c3aed",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}
        >
          <TeamOutlined />
          Leads Referenced ({leads.length})
        </div>
        <Space wrap size={[6, 6]}>
          {leads.map((lead) => {
            const st = leadStatusStyle(lead.status);
            const displayName = lead.name?.trim() || lead.email || lead.id.slice(0, 8);
            return (
              <button
                key={lead.id}
                type="button"
                onClick={() => setDetailLead(lead)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: "#fff",
                  border: "1px solid #e9d5ff",
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                  fontSize: 12,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#8b5cf6";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 0 2px rgba(139,92,246,0.1)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#e9d5ff";
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#ede9fe",
                    color: "#7c3aed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    flexShrink: 0,
                  }}
                >
                  <UserOutlined />
                </span>
                <span style={{ color: "#374151", fontWeight: 500 }}>
                  {displayName}
                </span>
                {lead.company_name && (
                  <span style={{ color: "#9ca3af" }}>· {lead.company_name}</span>
                )}
                <span
                  style={{
                    ...st,
                    fontSize: 10,
                    fontWeight: 600,
                    borderRadius: 5,
                    padding: "1px 5px",
                    border: `1px solid ${st.border}`,
                    textTransform: "capitalize",
                  }}
                >
                  {lead.status}
                </span>
              </button>
            );
          })}
        </Space>
      </div>

      {/* Lead detail modal */}
      <Modal
        open={!!detailLead}
        onCancel={() => setDetailLead(null)}
        footer={null}
        title={
          <Space>
            <UserOutlined style={{ color: "#7c3aed" }} />
            <span>{detailLead?.name?.trim() || detailLead?.email || "Lead"}</span>
          </Space>
        }
        width={400}
        destroyOnClose
      >
        {detailLead && (
          <Descriptions
            column={1}
            size="small"
            bordered
            style={{ marginTop: 8 }}
          >
            {detailLead.name && (
              <Descriptions.Item label="Name">{detailLead.name}</Descriptions.Item>
            )}
            {detailLead.company_name && (
              <Descriptions.Item label="Company">{detailLead.company_name}</Descriptions.Item>
            )}
            {detailLead.email && (
              <Descriptions.Item label="Email">{detailLead.email}</Descriptions.Item>
            )}
            {detailLead.phone && (
              <Descriptions.Item label="Phone">{detailLead.phone}</Descriptions.Item>
            )}
            <Descriptions.Item label="Status">
              <Tag
                style={{
                  ...leadStatusStyle(detailLead.status),
                  borderRadius: 6,
                  border: `1px solid ${leadStatusStyle(detailLead.status).border}`,
                  textTransform: "capitalize",
                }}
              >
                {detailLead.status}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  );
}

type FeedPostCardProps = {
  campaignId: string;
  post: CampaignFeedPost;
  members: CampaignFeedMember[];
  currentUserId: string;
  canModerate: boolean;
  onRefresh: () => void;
  /** Called after a successful soft-delete so the parent can mark the post locally. */
  onDeleted?: (postId: string) => void;
};

function ReplyBlock({
  reply,
  members,
  currentUserId,
  canModerate,
  onReact,
  onDelete,
}: {
  reply: CampaignFeedReply;
  members: CampaignFeedMember[];
  currentUserId: string;
  canModerate: boolean;
  onReact: (replyId: string, emoji: string) => void;
  onDelete: (replyId: string) => void;
}) {
  const reactionGroups = groupReactions(reply.reactions ?? []);
  const emojiPicker = (
    <div style={{ padding: "6px 4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 36px)", gap: 2 }}>
        {FEED_EMOJI_OPTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="text"
            size="small"
            onClick={() => onReact(reply.id, emoji)}
            style={{ fontSize: 18, width: 36, height: 36, padding: 0, lineHeight: 1 }}
          >
            {emoji}
          </Button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginTop: 10,
        padding: "10px 12px",
        background: "#f9fafb",
        borderRadius: 12,
        border: "1px solid #eef0f3",
      }}
    >
      <FeedUserAvatar user={reply.user} size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Text strong style={{ fontSize: 13 }}>
            {reply.user?.full_name ?? "User"}
          </Text>
          <FeedTimestamp value={reply.created_at} />
          {reply.edited_at && (
            <Tag style={{ fontSize: 10, lineHeight: "16px" }}>Edited</Tag>
          )}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 4, wordBreak: "break-word" }}>
          {renderFeedContent(reply.content, members)}
        </div>
        {(reply.attachments ?? []).length > 0 && (
          <Space direction="vertical" size={4} style={{ marginTop: 6, width: "100%" }}>
            {(reply.attachments ?? []).map((a) => {
              const isImage = a.mimeType?.startsWith("image/");
              if (isImage && a.downloadUrl) {
                return (
                  <a key={a.path} href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.downloadUrl} alt={a.fileName} style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8 }} />
                  </a>
                );
              }
              return (
                <a key={a.path} href={a.downloadUrl ?? "#"} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#4f46e5", fontSize: 13 }}>
                  <FileOutlined /> {a.fileName}
                  {a.downloadUrl && <DownloadOutlined style={{ fontSize: 11, color: "#9ca3af" }} />}
                </a>
              );
            })}
          </Space>
        )}
        <Space size={4} wrap style={{ marginTop: 6 }}>
          {reactionGroups.map((g) => (
            <Tooltip
              key={g.emoji}
              title={
                g.names.length
                  ? g.names.join(", ")
                  : g.count === 1
                  ? "1 person"
                  : `${g.count} people`
              }
            >
              <Button
                size="small"
                type={g.userIds.includes(currentUserId) ? "primary" : "default"}
                ghost={g.userIds.includes(currentUserId)}
                onClick={() => onReact(reply.id, g.emoji)}
                style={{ borderRadius: 16, fontSize: 12 }}
              >
                {g.emoji} {g.count}
              </Button>
            </Tooltip>
          ))}
          <Popover content={emojiPicker} trigger="click" placement="topLeft">
            <Tooltip title="React">
              <Button type="text" size="small" icon={<SmileOutlined />} />
            </Tooltip>
          </Popover>
          {(reply.user_id === currentUserId || canModerate) && (
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => onDelete(reply.id)}
            />
          )}
        </Space>
      </div>
    </div>
  );
}

export default function FeedPostCard({
  campaignId,
  post,
  members,
  currentUserId,
  canModerate,
  onRefresh,
  onDeleted,
}: FeedPostCardProps) {
  // All hooks must come before any conditional return
  const [showReplies, setShowReplies] = useState(false);
  const [allReplies, setAllReplies] = useState<CampaignFeedReply[] | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<CampaignFeedAttachment[]>([]);
  const [replyUploading, setReplyUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editSaving, setEditSaving] = useState(false);

  const reactionGroups = groupReactions(post.reactions ?? []);
  const isOwner = post.user_id === currentUserId;
  const replies = allReplies ?? post.replies ?? [];
  const replyCount = post.reply_count ?? replies.length;

  const toggleReaction = async (emoji: string, replyId?: string) => {
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}/reactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji, reply_id: replyId ?? null }),
        }
      );
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Failed");
      }
      onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Reaction failed");
    }
  };

  const loadAllReplies = async () => {
    if (allReplies) {
      setShowReplies((v) => !v);
      return;
    }
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}/replies`
      );
      const data = (await res.json()) as { replies?: CampaignFeedReply[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load replies");
      setAllReplies(data.replies ?? []);
      setShowReplies(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to load replies");
    }
  };

  const uploadReplyFiles = async (fileList: File[]) => {
    setReplyUploading(true);
    try {
      const presignRes = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/attachments/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: fileList.map((f) => ({ fileName: f.name, mimeType: f.type, fileSize: f.size })),
          }),
        }
      );
      const presignData = (await presignRes.json()) as {
        urls?: Array<{ signedUrl: string; path: string; fileName: string; mimeType: string; fileSize: number }>;
        error?: string;
      };
      if (!presignRes.ok) throw new Error(presignData.error ?? "Upload failed");

      const uploaded: CampaignFeedAttachment[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i]!;
        const meta = presignData.urls?.[i];
        if (!meta) continue;
        const putRes = await fetch(meta.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!putRes.ok) throw new Error(`Failed to upload ${file.name}`);
        uploaded.push({ path: meta.path, fileName: meta.fileName, mimeType: meta.mimeType, fileSize: meta.fileSize });
      }
      setReplyAttachments((prev) => [...prev, ...uploaded]);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setReplyUploading(false);
    }
  };

  const submitReply = async () => {
    const trimmed = replyDraft.trim();
    if (!trimmed && replyAttachments.length === 0) return;
    setReplySubmitting(true);
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}/replies`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, attachments: replyAttachments }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to reply");
      setReplyDraft("");
      setReplyAttachments([]);
      setAllReplies(null);
      setShowReplies(true);
      onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Reply failed");
    } finally {
      setReplySubmitting(false);
    }
  };

  const saveEdit = async () => {
    setEditSaving(true);
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editContent.trim() }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setEditing(false);
      onRefresh();
      message.success("Post updated");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setEditSaving(false);
    }
  };

  const deletePost = async () => {
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Delete failed");
      }
      // Optimistic: mark deleted locally so tombstone renders immediately.
      // onRefresh is intentionally skipped — RLS filters deleted posts on
      // re-fetch, so we keep the local tombstone instead.
      if (onDeleted) onDeleted(post.id);
      else onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const deleteReply = async (replyId: string) => {
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}/reactions?reply_id=${replyId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Delete failed");
      }
      setAllReplies(null);
      onRefresh();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const togglePin = async () => {
    try {
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/${post.id}/reactions`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !post.is_pinned }),
        }
      );
      if (!res.ok) throw new Error("Pin failed");
      onRefresh();
    } catch {
      message.error("Failed to update pin");
    }
  };

  const emojiPicker = (
    <div style={{ padding: "6px 4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 36px)", gap: 2 }}>
        {FEED_EMOJI_OPTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="text"
            size="small"
            onClick={() => void toggleReaction(emoji)}
            style={{ fontSize: 18, width: 36, height: 36, padding: 0, lineHeight: 1 }}
          >
            {emoji}
          </Button>
        ))}
      </div>
    </div>
  );

  const menuItems = [
    ...(isOwner
      ? [{ key: "edit", icon: <EditOutlined />, label: "Edit", onClick: () => setEditing(true) }]
      : []),
    ...(isOwner || canModerate
      ? [{ key: "delete", icon: <DeleteOutlined />, label: "Delete", danger: true, onClick: () => void deletePost() }]
      : []),
    ...(canModerate
      ? [{
          key: "pin",
          icon: post.is_pinned ? <PushpinFilled /> : <PushpinOutlined />,
          label: post.is_pinned ? "Unpin" : "Pin",
          onClick: () => void togglePin(),
        }]
      : []),
  ];

  const isDeleted = Boolean(post.deleted_at);

  return (
    <Card
      size="small"
      style={{
        borderRadius: 14,
        marginBottom: 12,
        border: post.is_pinned ? "1px solid #fbbf24" : "1px solid #f0f0f0",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
      styles={{ body: { padding: "14px 16px" } }}
    >
      <div style={{ display: "flex", gap: 12 }}>
        <FeedUserAvatar user={post.user} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <div>
              <Space wrap size={8}>
                <Text strong>{post.user?.full_name ?? "User"}</Text>
                <FeedPostTypeTag type={post.post_type} />
                {post.is_pinned && (
                  <Tag color="gold" icon={<PushpinFilled />}>
                    Pinned
                  </Tag>
                )}
              </Space>
              <div style={{ marginTop: 2 }}>
                <FeedTimestamp value={post.created_at} />
                {post.edited_at && !isDeleted && (
                  <Tag style={{ marginLeft: 8, fontSize: 10 }}>Edited</Tag>
                )}
                {isDeleted && (
                  <Tag icon={<DeleteOutlined />} style={{ marginLeft: 8, fontSize: 10, color: "#9ca3af", borderColor: "#e5e7eb", background: "#f9fafb" }}>
                    Deleted
                  </Tag>
                )}
              </div>
            </div>
            {!isDeleted && menuItems.length > 0 && (
              <Dropdown menu={{ items: menuItems }} trigger={["click"]}>
                <Button type="text" size="small" icon={<MoreOutlined />} />
              </Dropdown>
            )}
          </div>

          {isDeleted ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                background: "#f9fafb",
                borderRadius: 8,
                border: "1px solid #f0f0f0",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <DeleteOutlined style={{ color: "#d1d5db", fontSize: 13 }} />
              <Text italic style={{ fontSize: 13, color: "#9ca3af" }}>
                This message has been deleted.
              </Text>
            </div>
          ) : editing ? (
            <div style={{ marginTop: 10 }}>
              <TextArea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 8 }}
              />
              <Space style={{ marginTop: 8 }}>
                <Button size="small" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button
                  size="small"
                  type="primary"
                  loading={editSaving}
                  onClick={() => void saveEdit()}
                >
                  Save
                </Button>
              </Space>
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                marginTop: 10,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {renderFeedContent(post.content, members)}
            </div>
          )}

          {!isDeleted && <LeadRefsSection leads={post.lead_refs ?? []} />}

          {!isDeleted && post.attachments?.length > 0 && (
            <Space direction="vertical" style={{ marginTop: 10, width: "100%" }}>
              {post.attachments.map((a) => {
                const isImage = a.mimeType.startsWith("image/");
                if (isImage && a.downloadUrl) {
                  return (
                    <a key={a.path} href={a.downloadUrl} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.downloadUrl}
                        alt={a.fileName}
                        style={{ maxWidth: "100%", maxHeight: 280, borderRadius: 10 }}
                      />
                    </a>
                  );
                }
                return (
                  <a
                    key={a.path}
                    href={a.downloadUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#4f46e5" }}
                  >
                    📎 {a.fileName}
                  </a>
                );
              })}
            </Space>
          )}

          {!isDeleted && <Space wrap size={4} style={{ marginTop: 12 }}>
            {reactionGroups.map((g) => (
              <Tooltip
                key={g.emoji}
                title={
                  g.names.length
                    ? g.names.join(", ")
                    : g.count === 1
                    ? "1 person"
                    : `${g.count} people`
                }
              >
                <Button
                  size="small"
                  type={g.userIds.includes(currentUserId) ? "primary" : "default"}
                  ghost={g.userIds.includes(currentUserId)}
                  onClick={() => void toggleReaction(g.emoji)}
                  style={{ borderRadius: 16, fontSize: 13 }}
                >
                  {g.emoji} {g.count}
                </Button>
              </Tooltip>
            ))}
            <Popover content={emojiPicker} trigger="click" placement="topLeft">
              <Tooltip title="React">
                <Button size="small" type="text" icon={<SmileOutlined />}>
                  React
                </Button>
              </Tooltip>
            </Popover>
            <Button
              size="small"
              type="text"
              icon={<MessageOutlined />}
              onClick={() => void loadAllReplies()}
            >
              {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? "Reply" : "Replies"}` : "Reply"}
            </Button>
          </Space>}

          {!isDeleted && showReplies && (
            <div style={{ marginTop: 8 }}>
              {replies.map((r) => (
                <ReplyBlock
                  key={r.id}
                  reply={r}
                  members={members}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  onReact={(replyId, emoji) => void toggleReaction(emoji, replyId)}
                  onDelete={(replyId) => void deleteReply(replyId)}
                />
              ))}
              <div style={{ marginTop: 10 }}>
                {replyAttachments.length > 0 && (
                  <Space wrap style={{ marginBottom: 6 }}>
                    {replyAttachments.map((a) => (
                      <Tag
                        key={a.path}
                        icon={<PaperClipOutlined />}
                        closable
                        onClose={() => setReplyAttachments((prev) => prev.filter((x) => x.path !== a.path))}
                      >
                        {a.fileName}
                      </Tag>
                    ))}
                  </Space>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <TextArea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder="Write a reply…"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    style={{ borderRadius: 10, flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void submitReply();
                      }
                    }}
                  />
                  <Upload
                    showUploadList={false}
                    multiple
                    beforeUpload={(_, fileList) => {
                      void uploadReplyFiles(fileList as unknown as File[]);
                      return false;
                    }}
                  >
                    <Tooltip title="Attach file">
                      <Button
                        icon={<PaperClipOutlined />}
                        size="small"
                        loading={replyUploading}
                        style={{ alignSelf: "flex-end" }}
                      />
                    </Tooltip>
                  </Upload>
                  <Button
                    type="primary"
                    loading={replySubmitting}
                    onClick={() => void submitReply()}
                    style={{ alignSelf: "flex-end" }}
                  >
                    Reply
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
