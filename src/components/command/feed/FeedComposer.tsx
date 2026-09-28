"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Button,
  Select,
  Space,
  Upload,
  Popover,
  Tag,
  Tooltip,
  message,
  Modal,
  Input as AntInput,
} from "antd";
import {
  BoldOutlined,
  ItalicOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  LinkOutlined,
  PaperClipOutlined,
  SendOutlined,
  SmileOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import type {
  CampaignFeedAttachment,
  CampaignFeedLeadRef,
  CampaignFeedMember,
  CampaignFeedPostType,
} from "@/lib/command/campaign-feed-types";
import { FEED_EMOJI_OPTIONS } from "@/lib/command/campaign-feed-types";
import LeadPickerModal from "./LeadPickerModal";

type FeedComposerProps = {
  campaignId: string;
  members: CampaignFeedMember[];
  onPosted: () => void;
  compact?: boolean;
};

export default function FeedComposer({
  campaignId,
  members,
  onPosted,
  compact = false,
}: FeedComposerProps) {
  const [postType, setPostType] = useState<CampaignFeedPostType>("text");
  const [attachments, setAttachments] = useState<CampaignFeedAttachment[]>([]);
  const [leadRefs, setLeadRefs] = useState<CampaignFeedLeadRef[]>([]);
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeMentionIdx, setActiveMentionIdx] = useState(0);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  // Maps display label → uuid for @[uuid] encoding on submit
  const mentionRegistry = useRef<Map<string, string>>(new Map());

  // Refs so Tiptap's editorProps callbacks (which capture closures at init)
  // always see the latest state without triggering re-creation of the editor.
  const filteredMembersRef = useRef<CampaignFeedMember[]>([]);
  const activeMentionIdxRef = useRef(0);
  const mentionQueryRef = useRef<string | null>(null);
  const insertMentionRef = useRef<((m: CampaignFeedMember) => void) | null>(null);
  const submitRef = useRef<(() => Promise<void>) | null>(null);
  const setActiveMentionIdxRef = useRef(setActiveMentionIdx);
  const setMentionQueryRef = useRef(setMentionQuery);

  const filteredMembers =
    mentionQuery == null
      ? []
      : members
          .filter((m) => {
            const q = mentionQuery.toLowerCase();
            return (
              (m.full_name ?? "").toLowerCase().includes(q) ||
              (m.email ?? "").toLowerCase().includes(q)
            );
          })
          .slice(0, 8);

  // Keep refs in sync every render
  filteredMembersRef.current = filteredMembers;
  activeMentionIdxRef.current = activeMentionIdx;
  mentionQueryRef.current = mentionQuery;

  // Reset active index when list changes
  useEffect(() => {
    setActiveMentionIdx(0);
  }, [filteredMembers.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!dropdownRef.current) return;
    const active = dropdownRef.current.querySelector<HTMLButtonElement>(
      `[data-idx="${activeMentionIdx}"]`
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [activeMentionIdx]);

  /** Detect @query at cursor position inside the Tiptap editor. */
  function detectMentionFromEditor(editor: ReturnType<typeof useEditor>) {
    if (!editor) return;
    const { state } = editor;
    const { from } = state.selection;
    const textBefore = state.doc.textBetween(
      Math.max(0, from - 120),
      from,
      "\n",
      "\0"
    );
    const match = textBefore.match(/@(\w*)$/);
    setMentionQueryRef.current(match ? match[1]! : null);
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false }),
      TiptapLink.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Placeholder.configure({
        placeholder: "Share an update, ask a question, or @mention someone…",
      }),
    ],
    editorProps: {
      attributes: { class: "tiptap" },
      handleKeyDown: (_view, event) => {
        const members = filteredMembersRef.current;
        if (members.length > 0) {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveMentionIdxRef.current(
              (i) => (i + 1) % members.length
            );
            return true;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveMentionIdxRef.current(
              (i) => (i - 1 + members.length) % members.length
            );
            return true;
          }
          if (event.key === "Enter" && mentionQueryRef.current !== null) {
            event.preventDefault();
            const member = members[activeMentionIdxRef.current];
            if (member) insertMentionRef.current?.(member);
            return true;
          }
          if (event.key === "Escape") {
            setMentionQueryRef.current(null);
            return true;
          }
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submitRef.current?.();
          return true;
        }
        return false;
      },
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onUpdate: ({ editor: e }) => detectMentionFromEditor(e),
    onSelectionUpdate: ({ editor: e }) => detectMentionFromEditor(e),
  });

  const insertMention = useCallback(
    (member: CampaignFeedMember) => {
      if (!editor) return;
      const { state } = editor;
      const { from } = state.selection;
      const textBefore = state.doc.textBetween(
        Math.max(0, from - 120),
        from,
        "\n",
        "\0"
      );
      const match = textBefore.match(/@(\w*)$/);
      const displayName =
        member.full_name?.trim() ?? member.email ?? member.id;
      mentionRegistry.current.set(displayName, member.id);

      if (match) {
        const deleteFrom = from - match[0].length;
        editor
          .chain()
          .focus()
          .deleteRange({ from: deleteFrom, to: from })
          .insertContent(`@${displayName}\u00a0`)
          .run();
      } else {
        editor.chain().focus().insertContent(`@${displayName}\u00a0`).run();
      }
      setMentionQuery(null);
    },
    [editor]
  );

  // Keep insertMention ref in sync
  insertMentionRef.current = insertMention;

  /** Replace @DisplayName tokens with @[uuid] before storing (works on HTML). */
  const encodeContentMentions = useCallback((html: string): string => {
    if (!mentionRegistry.current.size) return html;
    const sorted = [...mentionRegistry.current.entries()].sort(
      (a, b) => b[0].length - a[0].length
    );
    let encoded = html;
    for (const [label, id] of sorted) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      encoded = encoded.replace(new RegExp(`@${escaped}`, "g"), `@[${id}]`);
    }
    return encoded;
  }, []);

  const uploadFiles = async (fileList: File[]) => {
    setUploading(true);
    try {
      const presignRes = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed/attachments/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: fileList.map((f) => ({
              fileName: f.name,
              mimeType: f.type,
              fileSize: f.size,
            })),
          }),
        }
      );
      const presignData = (await presignRes.json()) as {
        urls?: Array<{
          signedUrl: string;
          path: string;
          fileName: string;
          mimeType: string;
          fileSize: number;
        }>;
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
        uploaded.push({
          path: meta.path,
          fileName: meta.fileName,
          mimeType: meta.mimeType,
          fileSize: meta.fileSize,
        });
      }
      setAttachments((prev) => [...prev, ...uploaded]);
      if (uploaded.length) setPostType("file");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!editor) return;
    const isEmpty = editor.isEmpty;
    if (isEmpty && attachments.length === 0 && leadRefs.length === 0) return;
    setSubmitting(true);
    try {
      const html = isEmpty ? "" : editor.getHTML();
      const encoded = encodeContentMentions(html);
      const res = await fetchWithAuthRetry(
        `/api/command/campaigns/${campaignId}/feed`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: encoded,
            post_type: postType,
            attachments,
            lead_refs: leadRefs,
          }),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      editor.commands.clearContent();
      setAttachments([]);
      setLeadRefs([]);
      setPostType("text");
      mentionRegistry.current.clear();
      onPosted();
      message.success("Posted");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setSubmitting(false);
    }
  };

  // Keep submit ref in sync
  submitRef.current = submit;

  const applyLink = () => {
    if (!editor) return;
    const href = linkUrl.trim();
    if (href) {
      const { empty } = editor.state.selection;
      if (empty) {
        // No selection: insert the URL as link text
        editor
          .chain()
          .focus()
          .insertContent(
            `<a href="${href}" target="_blank" rel="noopener noreferrer">${href}</a>`
          )
          .run();
      } else {
        editor
          .chain()
          .focus()
          .extendMarkRange("link")
          .setLink({ href })
          .run();
      }
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkModalOpen(false);
    setLinkUrl("");
  };

  const emojiPicker = (
    <div style={{ padding: "6px 4px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, 36px)",
          gap: 2,
        }}
      >
        {FEED_EMOJI_OPTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="text"
            size="small"
            onClick={() =>
              editor?.chain().focus().insertContent(emoji).run()
            }
            style={{ fontSize: 18, width: 36, height: 36, padding: 0, lineHeight: 1 }}
          >
            {emoji}
          </Button>
        ))}
      </div>
    </div>
  );

  const toolbarDivider = (
    <div
      style={{
        width: 1,
        height: 16,
        background: "#e5e7eb",
        margin: "0 2px",
        flexShrink: 0,
      }}
    />
  );

  const toolbarBtn = (
    label: string,
    icon: React.ReactNode,
    active: boolean,
    onClick: () => void
  ) => (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`tiptap-toolbar-btn${active ? " is-active" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 6,
        cursor: "pointer",
        background: active ? "#eff6ff" : "transparent",
        color: active ? "#2563eb" : "#6b7280",
        fontSize: 14,
        padding: 0,
        transition: "background 0.15s, color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!active)
          (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = active
          ? "#eff6ff"
          : "transparent";
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 10,
        background: "#fff",
        borderTop: compact ? "none" : "1px solid #f0f0f0",
        padding: compact ? "8px 0 0" : "16px",
        borderRadius: compact ? 0 : "0 0 12px 12px",
      }}
    >
      {!compact && (
        <Space wrap style={{ marginBottom: 8 }}>
          <Select
            size="small"
            value={postType}
            onChange={setPostType}
            style={{ width: 140 }}
            options={[
              { value: "text", label: "Post" },
              { value: "announcement", label: "Announcement" },
              { value: "question", label: "Question" },
              { value: "update", label: "Update" },
            ]}
          />
        </Space>
      )}

      {/* Editor card */}
      <div
        style={{
          position: "relative",
          border: `1px solid ${isFocused ? "#4f46e5" : "#d9d9d9"}`,
          borderRadius: 12,
          background: "#fff",
          transition: "border-color 0.2s, box-shadow 0.2s",
          boxShadow: isFocused
            ? "0 0 0 2px rgba(79,70,229,0.10)"
            : undefined,
        }}
      >
        {/* Formatting toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "6px 8px 6px",
            borderBottom: "1px solid #f3f4f6",
          }}
        >
          {toolbarBtn("Bold (Ctrl+B)", <BoldOutlined />, !!editor?.isActive("bold"), () =>
            editor?.chain().focus().toggleBold().run()
          )}
          {toolbarBtn("Italic (Ctrl+I)", <ItalicOutlined />, !!editor?.isActive("italic"), () =>
            editor?.chain().focus().toggleItalic().run()
          )}
          {toolbarDivider}
          {toolbarBtn("Bullet List", <UnorderedListOutlined />, !!editor?.isActive("bulletList"), () =>
            editor?.chain().focus().toggleBulletList().run()
          )}
          {toolbarBtn("Numbered List", <OrderedListOutlined />, !!editor?.isActive("orderedList"), () =>
            editor?.chain().focus().toggleOrderedList().run()
          )}
          {toolbarDivider}
          {toolbarBtn(
            "Insert Link",
            <LinkOutlined />,
            !!editor?.isActive("link"),
            () => {
              const existing = editor?.getAttributes("link").href as string | undefined;
              setLinkUrl(existing ?? "");
              setLinkModalOpen(true);
            }
          )}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "#d1d5db",
              userSelect: "none",
              paddingRight: 2,
            }}
          >
            Ctrl+Enter to post
          </span>
        </div>

        {/* Tiptap editor area */}
        <div
          style={{
            padding: "8px 12px 48px",
            minHeight: compact ? 60 : 80,
            cursor: "text",
          }}
          onClick={() => editor?.commands.focus()}
        >
          <EditorContent editor={editor} />
        </div>

        {/* Mention dropdown */}
        {filteredMembers.length > 0 && (
          <div
            ref={dropdownRef}
            style={{
              position: "absolute",
              left: 8,
              bottom: 52,
              background: "#fff",
              border: "1px solid #e8eaed",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
              zIndex: 30,
              minWidth: 200,
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {filteredMembers.map((m, idx) => (
              <button
                key={m.id}
                data-idx={idx}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
                onMouseEnter={() => setActiveMentionIdx(idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 12px",
                  border: "none",
                  cursor: "pointer",
                  background:
                    idx === activeMentionIdx ? "#eff6ff" : "transparent",
                  transition: "background 0.1s",
                  borderRadius:
                    idx === 0
                      ? "10px 10px 0 0"
                      : idx === filteredMembers.length - 1
                      ? "0 0 10px 10px"
                      : 0,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "#1d4ed8",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {(m.full_name ?? m.email ?? "?").charAt(0).toUpperCase()}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}
                  >
                    {m.full_name ?? m.email}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      marginLeft: 6,
                    }}
                  >
                    {m.role_label}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Bottom action bar */}
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            display: "flex",
            gap: 4,
            alignItems: "center",
            zIndex: 2,
          }}
        >
          <Popover content={emojiPicker} trigger="click" placement="topRight">
            <Button type="text" icon={<SmileOutlined />} size="small" />
          </Popover>
          <Upload
            showUploadList={false}
            multiple
            beforeUpload={(_, fileList) => {
              void uploadFiles(fileList as unknown as File[]);
              return false;
            }}
          >
            <Button
              type="text"
              icon={<PaperClipOutlined />}
              size="small"
              loading={uploading}
            />
          </Upload>
          <Tooltip title="Attach leads to this post">
            <Button
              type={leadRefs.length > 0 ? "default" : "text"}
              icon={<TeamOutlined />}
              size="small"
              onClick={() => setLeadPickerOpen(true)}
              style={
                leadRefs.length > 0
                  ? { color: "#4f46e5", borderColor: "#c7d2fe", background: "#eff6ff" }
                  : undefined
              }
            >
              {leadRefs.length > 0 ? `${leadRefs.length} Lead${leadRefs.length > 1 ? "s" : ""}` : undefined}
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<SendOutlined />}
            size="small"
            loading={submitting}
            onClick={() => void submit()}
          >
            Post
          </Button>
        </div>
      </div>

      {/* Attached file pills */}
      {attachments.length > 0 && (
        <Space wrap style={{ marginTop: 8 }}>
          {attachments.map((a) => (
            <Tag
              key={a.path}
              closable
              onClose={() =>
                setAttachments((prev) =>
                  prev.filter((x) => x.path !== a.path)
                )
              }
            >
              {a.fileName}
            </Tag>
          ))}
        </Space>
      )}

      {/* Attached lead chips */}
      {leadRefs.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            background: "#f5f3ff",
            borderRadius: 10,
            border: "1px solid #ddd6fe",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "#7c3aed",
              fontWeight: 600,
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Leads ({leadRefs.length})
          </div>
          <Space wrap size={[6, 6]}>
            {leadRefs.map((lead) => (
              <Tag
                key={lead.id}
                closable
                onClose={() =>
                  setLeadRefs((prev) => prev.filter((l) => l.id !== lead.id))
                }
                style={{
                  borderRadius: 8,
                  background: "#ede9fe",
                  borderColor: "#c4b5fd",
                  color: "#5b21b6",
                  fontSize: 12,
                }}
              >
                {lead.name?.trim() || lead.email || lead.id.slice(0, 8)}
                {lead.company_name && (
                  <span style={{ color: "#8b5cf6", marginLeft: 4 }}>
                    · {lead.company_name}
                  </span>
                )}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* Lead picker modal */}
      <LeadPickerModal
        open={leadPickerOpen}
        campaignId={campaignId}
        selected={leadRefs}
        onConfirm={(leads) => {
          setLeadRefs(leads);
          setLeadPickerOpen(false);
        }}
        onCancel={() => setLeadPickerOpen(false)}
      />

      {/* Link URL modal */}
      <Modal
        title="Insert link"
        open={linkModalOpen}
        onOk={applyLink}
        onCancel={() => {
          setLinkModalOpen(false);
          setLinkUrl("");
        }}
        okText="Apply"
        width={380}
        destroyOnClose
      >
        <AntInput
          autoFocus
          placeholder="https://example.com"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onPressEnter={applyLink}
          style={{ marginTop: 8 }}
        />
        {editor?.isActive("link") && (
          <Button
            type="link"
            danger
            size="small"
            style={{ padding: 0, marginTop: 6 }}
            onClick={() => {
              editor.chain().focus().unsetLink().run();
              setLinkModalOpen(false);
              setLinkUrl("");
            }}
          >
            Remove link
          </Button>
        )}
      </Modal>
    </div>
  );
}
