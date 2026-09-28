"use client";

import { IconChecks } from "@tabler/icons-react";
import type { ChatMessage } from "./types";
import { avatarBackground } from "./avatarColors";

interface MessageBubbleProps {
  message: ChatMessage;
  /** For inbound small avatar */
  leadInitials: string;
  avatarHue: number;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function MessageBubble({ message, leadInitials, avatarHue }: MessageBubbleProps) {
  const inbound = message.direction === "inbound";
  const bg = avatarBackground(avatarHue);

  if (inbound) {
    return (
      <div className="flex max-w-[70%] gap-2 self-start">
        <div className="flex flex-col justify-end pb-5">
          <div
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
            style={{ background: bg }}
          >
            {leadInitials}
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="rounded-[2px_12px_12px_12px] border border-[var(--border,#e4e7ec)] bg-[var(--bg,#ffffff)] px-3 py-2 text-[14px] leading-snug text-[var(--text,#101828)]"
          >
            {message.body}
          </div>
          <div className="mt-1 pl-0.5 text-[10px] text-[var(--text3,#98a2b3)]">{formatTime(message.createdAt)}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex max-w-[70%] flex-col items-end self-end">
      <div className="rounded-[12px_12px_2px_12px] bg-[var(--green,#16a34a)] px-3 py-2 text-[14px] leading-snug text-white">
        {message.body}
      </div>
      <div className="mt-1 flex w-full items-center justify-end gap-1 text-[10px] text-[var(--text3,#98a2b3)]">
        <span>{formatTime(message.createdAt)}</span>
        {message.status === "read" || message.status === "delivered" || message.status === "sent" ? (
          <IconChecks size={14} className="text-[var(--green,#16a34a)]" aria-hidden />
        ) : null}
      </div>
    </div>
  );
}
