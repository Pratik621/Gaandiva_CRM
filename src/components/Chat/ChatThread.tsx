"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  IconBrandWhatsapp,
  IconPaperclip,
  IconSend,
  IconLayoutSidebarRight,
} from "@tabler/icons-react";
import type { ChatMessage, ClientThread } from "./types";
import MessageBubble from "./MessageBubble";
import { avatarBackground } from "./avatarColors";

function formatDividerDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    const long = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return isToday ? `Today, ${long}` : long;
  } catch {
    return "";
  }
}

function dayKey(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-[#e4e7ec]" />
      <span className="shrink-0 text-[10px] text-[#98a2b3]">{label}</span>
      <div className="h-px flex-1 bg-[#e4e7ec]" />
    </div>
  );
}

const QUICK_CHIPS: { emoji: string; label: string; text: string }[] = [
  { emoji: "📅", label: "Schedule demo", text: "Let’s schedule a quick demo — which slots work this week?" },
  { emoji: "💰", label: "Share pricing", text: "Sharing our pricing overview for your team." },
  { emoji: "📎", label: "Attach file", text: "I’m attaching the document to this chat." },
];

interface ChatThreadProps {
  thread: ClientThread | null;
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (v: string) => void;
  onSend: () => void;
  loading?: boolean;
  clientInfoOpen: boolean;
  onToggleClientInfo: () => void;
}

export default function ChatThread({
  thread,
  messages,
  draft,
  onDraftChange,
  onSend,
  loading = false,
  clientInfoOpen,
  onToggleClientInfo,
}: ChatThreadProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => {
    const rows: { type: "divider" | "msg"; key: string; label?: string; message?: ChatMessage }[] = [];
    let lastDay = "";
    for (const m of messages) {
      const dk = dayKey(m.createdAt);
      if (dk !== lastDay) {
        lastDay = dk;
        rows.push({ type: "divider", key: `d-${dk}`, label: formatDividerDate(m.createdAt) });
      }
      rows.push({ type: "msg", key: m.id, message: m });
    }
    return rows;
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    queueMicrotask(scrollToBottom);
  }, [messages, thread?.id, scrollToBottom]);

  if (!thread) {
    return (
      <div className="flex min-w-0 flex-1 items-center justify-center bg-[#f0f2f5] text-[14px] text-[#98a2b3]">
        Select a client and campaign to start chatting
      </div>
    );
  }

  const headerBg = avatarBackground(thread.avatarHue);

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-[#f0f2f5]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e4e7ec] bg-white px-4 py-3">
        <div className="flex min-w-0 gap-3">
          <div
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
            style={{ background: headerBg }}
          >
            {thread.initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold text-[#101828]">{thread.companyName}</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#4f46e5] px-2 py-0.5 text-[11px] font-medium text-white">
                <IconBrandWhatsapp size={13} stroke={1.5} aria-hidden />
                WhatsApp
              </span>
            </div>
            <p className="mt-1 truncate text-[11px] text-[#98a2b3]">Campaign: {thread.campaignName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleClientInfo}
          aria-pressed={clientInfoOpen}
          title={clientInfoOpen ? "Hide client info" : "Show client info"}
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors",
            clientInfoOpen
              ? "border-[#16a34a] bg-emerald-50 text-[#16a34a]"
              : "border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f7f8fa]",
          ].join(" ")}
        >
          <IconLayoutSidebarRight size={18} stroke={1.5} aria-hidden />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading && messages.length === 0 ? (
          <p className="text-center text-[13px] text-[#98a2b3]">Loading messages…</p>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-1">
            {grouped.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[#98a2b3]">
                {thread.hasWhatsApp
                  ? "No messages yet. Say hello to this client."
                  : "Add this client’s Mobile number under Sales → Clients (at least 10 digits), then reopen chat."}
              </p>
            ) : (
              grouped.map((row) =>
                row.type === "divider" && row.label ? (
                  <DateDivider key={row.key} label={row.label} />
                ) : row.type === "msg" && row.message ? (
                  <MessageBubble
                    key={row.key}
                    message={row.message}
                    leadInitials={thread.initials}
                    avatarHue={thread.avatarHue}
                  />
                ) : null
              )
            )}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-l border-t border-[var(--border,#e4e7ec)] bg-white px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="mb-2 flex flex-wrap gap-2">
            {QUICK_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => onDraftChange(c.text)}
                className="rounded-full border border-[#e4e7ec] bg-[#f7f8fa] px-3 py-1.5 text-[12px] font-medium text-[#344054] hover:border-[#16a34a] hover:text-[#16a34a]"
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Message this client…"
              className="min-h-[44px] flex-1 resize-none rounded-[20px] border-0 bg-[#f7f8fa] px-4 py-2.5 text-[14px] text-[#101828] outline-none ring-1 ring-transparent placeholder:text-[#98a2b3] focus:ring-[#16a34a]"
            />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-[#f7f8fa] text-[#475467] hover:bg-[#e4e7ec]"
              aria-label="Attach file"
            >
              <IconPaperclip size={20} stroke={1.5} />
            </button>
            <button
              type="button"
              onClick={onSend}
              className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-[var(--green,#16a34a)] text-white shadow-sm hover:opacity-95"
              aria-label="Send"
            >
              <IconSend size={18} stroke={1.5} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
