import type { ChatMessage, ClientThread } from "./types";

/** Legacy mock — not used when Supabase client chat is enabled. */
export const MOCK_CLIENT_THREAD: ClientThread = {
  id: "mock-thread-1",
  clientId: "mock-client-1",
  companyName: "Acme Corp",
  contactPerson: "Priya Sharma",
  initials: "AC",
  avatarHue: 0,
  campaignId: "mock-campaign-1",
  campaignName: "Q2 Outbound",
  lastMessage: "Thanks, we will review the proposal.",
  lastMessageAt: new Date().toISOString(),
  unreadCount: 0,
  firstContactAt: new Date().toISOString(),
  hasWhatsApp: true,
};

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    direction: "inbound",
    body: "Hi, we received your outreach.",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    status: "read",
  },
  {
    id: "m2",
    direction: "outbound",
    body: "Great — happy to share more details on our services.",
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    status: "delivered",
  },
];
