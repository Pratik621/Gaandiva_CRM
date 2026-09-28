"use client";

import { IconLock, IconMessage2, IconCalendar } from "@tabler/icons-react";
import type { CSSProperties } from "react";
import type { ClientThread } from "./types";

interface ClientInfoPanelProps {
  thread: ClientThread | null;
  open: boolean;
  messageCount: number;
}

const PANEL_SHELL =
  "crm-client-info-panel flex h-full shrink-0 flex-col overflow-hidden border-l border-[#e4e7ec] bg-white";

function panelStyle(open: boolean): CSSProperties {
  return {
    width: open ? 220 : 0,
    transition: "width 220ms ease",
  };
}

export default function ClientInfoPanel({ thread, open, messageCount }: ClientInfoPanelProps) {
  const lastMsg = thread
    ? new Date(thread.lastMessageAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <aside className={PANEL_SHELL} style={panelStyle(open)} aria-hidden={!open}>
      <div className="flex w-[220px] min-w-[220px] flex-1 flex-col overflow-y-auto">
        {!thread ? (
          <div className="p-4">
            <p className="m-0 text-[13px] text-[#98a2b3]">Select a client and campaign</p>
          </div>
        ) : (
          <>
            <div className="border-b border-[#e4e7ec] p-4">
              <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wide text-[#98a2b3]">
                Client info
              </h3>
              <dl className="mt-3 space-y-2.5">
                <div>
                  <dt className="text-[10px] font-medium uppercase text-[#98a2b3]">Company</dt>
                  <dd className="m-0 text-[13px] font-semibold text-[#101828]">{thread.companyName}</dd>
                </div>
                {thread.contactPerson ? (
                  <div>
                    <dt className="text-[10px] font-medium uppercase text-[#98a2b3]">Contact</dt>
                    <dd className="m-0 text-[13px] text-[#344054]">{thread.contactPerson}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[10px] font-medium uppercase text-[#98a2b3]">WhatsApp</dt>
                  <dd className="m-0 flex items-center gap-1 text-[13px] font-medium text-[#ef4444]">
                    <IconLock size={14} stroke={1.5} aria-hidden />
                    {thread.hasWhatsApp ? "Linked from client Mobile" : "Add Mobile in Sales → Clients"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-medium uppercase text-[#98a2b3]">Campaign</dt>
                  <dd className="m-0 text-[13px] text-[#344054]">{thread.campaignName}</dd>
                </div>
              </dl>
            </div>

            <div className="border-b border-[#e4e7ec] p-4">
              <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wide text-[#98a2b3]">
                Activity
              </h3>
              <div className="mt-3 space-y-2">
                <div className="flex items-start gap-2 text-[12px] text-[#344054]">
                  <IconMessage2 className="mt-0.5 shrink-0 text-[#16a34a]" size={16} stroke={1.5} aria-hidden />
                  <span>
                    {messageCount} messages · last {lastMsg}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[12px] text-[#344054]">
                  <IconCalendar className="mt-0.5 shrink-0 text-[#4f46e5]" size={16} stroke={1.5} aria-hidden />
                  <span>
                    Thread started{" "}
                    {new Date(thread.firstContactAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
