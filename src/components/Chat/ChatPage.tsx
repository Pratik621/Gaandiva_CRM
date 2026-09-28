"use client";

import InboxPanel from "./InboxPanel";
import ChatThread from "./ChatThread";
import ClientInfoPanel from "./ClientInfoPanel";
import { useChat } from "./useChat";

export default function ChatPage() {
  const {
    activeThread,
    threadMessages,
    messagesLoading,
    threadLoading,
    threadError,
    draft,
    setDraft,
    sendMessage,
    clientInfoOpen,
    setClientInfoOpen,
    chatClients,
    clientsLoading,
    clientsError,
    selectedClientId,
    selectClient,
    clientCampaigns,
    selectedCampaignId,
    selectedCampaignName,
    selectCampaign,
  } = useChat();

  return (
    <div
      className="crm-chat-root flex min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border,#e4e7ec)] bg-[var(--bg,#ffffff)] shadow-sm"
      style={{
        margin: -24,
        width: "calc(100% + 48px)",
        height: "calc(100vh - 70px - 48px)",
      }}
    >
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        <InboxPanel
          clients={chatClients}
          clientsLoading={clientsLoading}
          clientsError={clientsError}
          selectedClientId={selectedClientId}
          onSelectClient={selectClient}
          clientCampaigns={clientCampaigns}
          selectedCampaignId={selectedCampaignId}
          onSelectCampaign={selectCampaign}
          selectedCampaignName={selectedCampaignName}
          threadLoading={threadLoading}
          threadError={threadError}
          hasActiveThread={Boolean(activeThread)}
        />
        <ChatThread
          thread={activeThread}
          messages={threadMessages}
          draft={draft}
          onDraftChange={setDraft}
          onSend={sendMessage}
          loading={messagesLoading}
          clientInfoOpen={clientInfoOpen}
          onToggleClientInfo={() => setClientInfoOpen((v) => !v)}
        />
        <ClientInfoPanel
          thread={activeThread}
          open={clientInfoOpen}
          messageCount={threadMessages.length}
        />
      </div>
    </div>
  );
}
