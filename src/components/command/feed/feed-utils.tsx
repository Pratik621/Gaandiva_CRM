"use client";

import type { ReactNode } from "react";
import { Avatar, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { avatarBackground } from "@/components/Chat/avatarColors";
import type { CampaignFeedMember } from "@/lib/command/campaign-feed-types";

const { Text } = Typography;

export function feedUserInitials(name: string | null | undefined, email?: string | null): string {
  const src = (name ?? email ?? "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function FeedUserAvatar({
  user,
  size = 40,
}: {
  user: { full_name?: string | null; avatar_url?: string | null; email?: string | null } | null | undefined;
  size?: number;
}) {
  const initials = feedUserInitials(user?.full_name, user?.email);
  const hue = (user?.full_name ?? user?.email ?? "").length;

  return (
    <Avatar
      size={size}
      src={user?.avatar_url ?? undefined}
      style={
        user?.avatar_url
          ? undefined
          : { background: avatarBackground(hue), fontSize: size * 0.35, fontWeight: 600 }
      }
    >
      {initials}
    </Avatar>
  );
}

export function FeedTimestamp({ value }: { value: string }) {
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {dayjs(value).format("MMM D, YYYY · h:mm A")}
    </Text>
  );
}

export function FeedPostTypeTag({ type }: { type: string }) {
  const colors: Record<string, string> = {
    announcement: "gold",
    question: "blue",
    update: "green",
    file: "purple",
    text: "default",
  };
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <Tag color={colors[type] ?? "default"} style={{ marginInlineEnd: 0 }}>
      {label}
    </Tag>
  );
}

const URL_REGEX = /(https?:\/\/[^\s<]+[^\s<.,;:!?)}\]'"])/gi;

/**
 * Tiptap always outputs block-level HTML starting with <p>, <ul>, <ol>, etc.
 * Legacy plain-text posts never start with an HTML tag.
 */
function isRichHtml(content: string): boolean {
  return /^<(p|ul|ol|h[1-6]|blockquote|pre|div)[\s>/]/i.test(content.trim());
}

/**
 * Client-side HTML sanitizer — strips tags/attributes not on the allowlist.
 * Only called from a "use client" component so DOMParser is always available.
 */
function sanitizeHtml(html: string): string {
  if (typeof window === "undefined") return "";
  const ALLOWED = new Set([
    "p","strong","em","s","del","u","ul","ol","li",
    "a","br","h1","h2","h3","h4","blockquote","code","pre","span",
  ]);
  const ALLOWED_ATTRS: Record<string, string[]> = {
    a: ["href", "target", "rel"],
    span: ["class", "style"],
  };

  const doc = new DOMParser().parseFromString(html, "text/html");

  function cleanNode(node: ChildNode): ChildNode | DocumentFragment | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(true) as ChildNode;
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED.has(tag)) {
      const frag = document.createDocumentFragment();
      for (const child of el.childNodes) {
        const c = cleanNode(child);
        if (c) frag.appendChild(c);
      }
      return frag;
    }
    const newEl = document.createElement(tag);
    const allowedAttrs = ALLOWED_ATTRS[tag] ?? [];
    for (const attr of el.attributes) {
      if (!allowedAttrs.includes(attr.name)) continue;
      if (attr.name === "href") {
        const v = attr.value.trim().toLowerCase();
        if (v.startsWith("javascript:") || v.startsWith("data:")) continue;
      }
      newEl.setAttribute(attr.name, attr.value);
    }
    for (const child of el.childNodes) {
      const c = cleanNode(child);
      if (c) newEl.appendChild(c);
    }
    return newEl;
  }

  const frag = document.createDocumentFragment();
  for (const child of doc.body.childNodes) {
    const c = cleanNode(child);
    if (c) frag.appendChild(c);
  }
  const container = document.createElement("div");
  container.appendChild(frag);
  return container.innerHTML;
}

export function renderFeedContent(
  content: string,
  members: CampaignFeedMember[]
): ReactNode {
  if (!content) return null;

  const memberMap = new Map(members.map((m) => [m.id, m]));

  // ── Rich HTML (Tiptap output) ──────────────────────────────────────────────
  if (isRichHtml(content)) {
    // Replace @[uuid] with styled mention spans, then sanitize
    const withMentions = content.replace(
      /@\[([0-9a-f-]{36})\]/gi,
      (_match, id: string) => {
        const member = memberMap.get(id.toLowerCase()) ?? memberMap.get(id);
        const label = member?.full_name ?? member?.email ?? "User";
        return `<span class="feed-mention-tag">@${label}</span>`;
      }
    );
    const clean = sanitizeHtml(withMentions);
    return (
      <div
        className="feed-rich-content"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }

  // ── Legacy plain text ──────────────────────────────────────────────────────
  const withMentions = content.replace(
    /@\[([0-9a-f-]{36})\]/gi,
    (_match, id: string) => {
      const member = memberMap.get(id.toLowerCase()) ?? memberMap.get(id);
      const label = member?.full_name ?? member?.email ?? "User";
      return `@${label}`;
    }
  );

  const parts = withMentions.split(URL_REGEX);
  return parts.map((part, i) => {
    if (part.match(URL_REGEX)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#4f46e5", wordBreak: "break-all" }}
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function groupReactions(
  reactions: { emoji: string; user_id: string; user?: { full_name?: string | null } | null }[]
) {
  const map = new Map<string, { emoji: string; count: number; userIds: string[]; names: string[] }>();
  for (const r of reactions) {
    const firstName = r.user?.full_name?.trim().split(/\s+/)[0] ?? null;
    const existing = map.get(r.emoji);
    if (existing) {
      existing.count += 1;
      existing.userIds.push(r.user_id);
      if (firstName) existing.names.push(firstName);
    } else {
      map.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        userIds: [r.user_id],
        names: firstName ? [firstName] : [],
      });
    }
  }
  return [...map.values()];
}
