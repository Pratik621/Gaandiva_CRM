"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthReady } from "@/hooks/useAuthReady";
import { fetchWithAuthRetry } from "@/lib/api/fetch-with-auth-retry";
import type { ChatMessage, ChatInboxClient, ClientThread } from "./types";

export function useChat() {
  const authReady = useAuthReady();
  const [activeThread, setActiveThread] = useState<ClientThread | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [chatClients, setChatClients] = useState<ChatInboxClient[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    (async () => {
      setClientsLoading(true);
      setClientsError(null);
      try {
        const res = await fetchWithAuthRetry("/api/chat/campaigns");
        const json = (await res.json()) as { clients?: ChatInboxClient[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load clients");
        if (cancelled) return;
        const list = json.clients ?? [];
        setChatClients(list);
        if (list.length === 0) {
          setSelectedClientId(null);
          setSelectedCampaignId(null);
        } else {
          setSelectedClientId((prevClientId) => {
            const client = list.find((c) => c.id === prevClientId) ?? list[0]!;
            setSelectedCampaignId((prevCampaignId) => {
              const camp =
                client.campaigns.find((x) => x.id === prevCampaignId) ?? client.campaigns[0];
              return camp?.id ?? null;
            });
            return client.id;
          });
        }
      } catch (e) {
        if (!cancelled) {
          setClientsError(e instanceof Error ? e.message : "Failed to load clients");
          setChatClients([]);
          setSelectedClientId(null);
          setSelectedCampaignId(null);
        }
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !selectedCampaignId) {
      setActiveThread(null);
      setThreadMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setThreadLoading(true);
      setThreadError(null);
      try {
        const res = await fetchWithAuthRetry(
          `/api/chat/thread?campaignId=${encodeURIComponent(selectedCampaignId)}`
        );
        const json = (await res.json()) as { thread?: ClientThread; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load chat");
        if (cancelled) return;
        setActiveThread(json.thread ?? null);
        setThreadMessages([]);
      } catch (e) {
        if (!cancelled) {
          setThreadError(e instanceof Error ? e.message : "Failed to load chat");
          setActiveThread(null);
          setThreadMessages([]);
        }
      } finally {
        if (!cancelled) setThreadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, selectedCampaignId]);

  useEffect(() => {
    if (!authReady || !activeThread?.id) return;
    let cancelled = false;
    (async () => {
      setMessagesLoading(true);
      try {
        const res = await fetchWithAuthRetry(
          `/api/chat/threads/${encodeURIComponent(activeThread.id)}/messages`
        );
        const json = (await res.json()) as { messages?: ChatMessage[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load messages");
        if (cancelled) return;
        setThreadMessages(json.messages ?? []);
      } catch {
        if (!cancelled) setThreadMessages([]);
      } finally {
        if (!cancelled) setMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, activeThread?.id]);

  // Poll for inbound WhatsApp messages while thread is open
  useEffect(() => {
    if (!authReady || !activeThread?.id) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetchWithAuthRetry(
          `/api/chat/threads/${encodeURIComponent(activeThread.id)}/messages`
        );
        const json = (await res.json()) as { messages?: ChatMessage[] };
        if (!res.ok || cancelled) return;
        setThreadMessages(json.messages ?? []);
      } catch {
        /* ignore poll errors */
      }
    };
    const id = window.setInterval(poll, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [authReady, activeThread?.id]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (mq.matches) setClientInfoOpen(false);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const selectedClient = useMemo(
    () => chatClients.find((c) => c.id === selectedClientId) ?? null,
    [chatClients, selectedClientId]
  );

  const clientCampaigns = useMemo(
    () => selectedClient?.campaigns ?? [],
    [selectedClient]
  );

  useEffect(() => {
    if (clientCampaigns.length === 0) return;
    if (!selectedCampaignId || !clientCampaigns.some((c) => c.id === selectedCampaignId)) {
      setSelectedCampaignId(clientCampaigns[0].id);
    }
  }, [clientCampaigns, selectedCampaignId]);

  const selectClient = useCallback(
    (clientId: string) => {
      setSelectedClientId(clientId);
      const client = chatClients.find((c) => c.id === clientId);
      setSelectedCampaignId(client?.campaigns[0]?.id ?? null);
    },
    [chatClients]
  );

  const selectCampaign = useCallback((campaignId: string) => {
    setSelectedCampaignId(campaignId);
  }, []);

  const selectedCampaignName = useMemo(
    () => clientCampaigns.find((c) => c.id === selectedCampaignId)?.name ?? null,
    [clientCampaigns, selectedCampaignId]
  );

  const sendMessage = useCallback(async () => {
    const body = draft.trim();
    if (!body || !activeThread?.id) return;

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      direction: "outbound",
      body,
      createdAt: new Date().toISOString(),
      status: "sent",
    };

    setThreadMessages((prev) => [...prev, optimistic]);
    setActiveThread((prev) =>
      prev
        ? { ...prev, lastMessage: body, lastMessageAt: optimistic.createdAt, unreadCount: 0 }
        : prev
    );
    setDraft("");

    try {
      const res = await fetchWithAuthRetry(
        `/api/chat/threads/${encodeURIComponent(activeThread.id)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        }
      );
      const json = (await res.json()) as { message?: ChatMessage; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      if (json.message) {
        setThreadMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic.id),
          json.message!,
        ]);
      }
    } catch (e) {
      setThreadMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      alert(e instanceof Error ? e.message : "Could not send message");
    }
  }, [activeThread?.id, draft]);

  return {
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
    selectedClient,
    selectedCampaignName,
    clientCampaigns,
    selectClient,
    selectedCampaignId,
    selectCampaign,
  };
}
