"use client";

import { IconBrandWhatsapp } from "@tabler/icons-react";
import type { ChatInboxCampaign, ChatInboxClient } from "./types";

interface InboxPanelProps {
  clients: ChatInboxClient[];
  clientsLoading: boolean;
  clientsError: string | null;
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  clientCampaigns: ChatInboxCampaign[];
  selectedCampaignId: string | null;
  onSelectCampaign: (campaignId: string) => void;
  selectedCampaignName: string | null;
  threadLoading?: boolean;
  threadError?: string | null;
  hasActiveThread?: boolean;
}

export default function InboxPanel({
  clients,
  clientsLoading,
  clientsError,
  selectedClientId,
  onSelectClient,
  clientCampaigns,
  selectedCampaignId,
  onSelectCampaign,
  selectedCampaignName,
  threadLoading = false,
  threadError = null,
  hasActiveThread = false,
}: InboxPanelProps) {
  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className="flex h-full w-[248px] shrink-0 flex-col border-r border-[#e4e7ec] bg-white">
      <div className="shrink-0 border-b border-[#e4e7ec] px-3 pb-3 pt-3">
        <h2 className="m-0 mb-2 text-[15px] font-semibold text-[#101828]">Inbox</h2>

        {clientsError ? (
          <p className="mb-2 rounded-lg bg-[#fef3f2] px-2 py-1.5 text-[11px] text-[#b91c1c]">{clientsError}</p>
        ) : null}

        <label className="mb-2 block">
          <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#98a2b3]">
            Client
          </span>
          {clientsLoading ? (
            <div className="h-9 animate-pulse rounded-lg bg-[#f2f4f7]" aria-hidden />
          ) : clients.length === 0 ? (
            <p className="text-[11px] leading-snug text-[#98a2b3]">No clients with active campaigns.</p>
          ) : (
            <select
              value={selectedClientId ?? ""}
              onChange={(e) => onSelectClient(e.target.value)}
              className="w-full cursor-pointer appearance-none rounded-lg border border-[#e4e7ec] bg-[#f7f8fa] py-2 pl-2.5 pr-7 text-[12px] font-medium text-[#101828] outline-none focus:border-[#16a34a] focus:ring-1 focus:ring-[#16a34a]"
              aria-label="Select client"
            >
              {clients.map((cl) => (
                <option key={cl.id} value={cl.id}>
                  {cl.companyName}
                  {cl.campaigns.length > 1 ? ` (${cl.campaigns.length} campaigns)` : ""}
                </option>
              ))}
            </select>
          )}
        </label>

        {clientCampaigns.length > 0 ? (
          <div className="mb-0">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[#98a2b3]">
              Campaign
            </span>
            <div className="max-h-[140px] space-y-1 overflow-y-auto rounded-lg border border-[#eef1f5] bg-[#fafbfb] p-1">
              {clientCampaigns.map((camp) => {
                const on = camp.id === selectedCampaignId;
                return (
                  <button
                    key={camp.id}
                    type="button"
                    onClick={() => onSelectCampaign(camp.id)}
                    className={[
                      "w-full truncate rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors",
                      on
                        ? "border-[#16a34a] bg-[#ecfdf5] font-semibold text-[#065f46]"
                        : "border-transparent bg-white font-medium text-[#344054] hover:bg-[#f7f8fa]",
                    ].join(" ")}
                    title={camp.name}
                  >
                    {camp.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="crm-inbox-scroll flex min-h-0 flex-1 flex-col px-3 py-4">
        {!selectedCampaignId ? (
          <p className="text-center text-[12px] leading-relaxed text-[#98a2b3]">
            Select a client and campaign to open WhatsApp chat.
          </p>
        ) : threadError ? (
          <p className="text-center text-[12px] text-[#b91c1c]">{threadError}</p>
        ) : threadLoading ? (
          <div className="space-y-2">
            <div className="h-12 animate-pulse rounded-lg bg-[#f2f4f7]" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-[#f2f4f7]" />
          </div>
        ) : hasActiveThread && selectedClient ? (
          <div className="rounded-lg border border-[#e4e7ec] bg-[#f7f8fa] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-[#16a34a]">
              <IconBrandWhatsapp size={14} stroke={1.5} aria-hidden />
              Client chat open
            </div>
            <p className="m-0 text-[13px] font-semibold text-[#101828]">{selectedClient.companyName}</p>
            {selectedCampaignName ? (
              <p className="mt-1 m-0 text-[11px] text-[#667085]">Campaign: {selectedCampaignName}</p>
            ) : null}
            <p className="mt-2 m-0 text-[11px] leading-relaxed text-[#98a2b3]">
              Messages with this client for the selected campaign appear on the right.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
