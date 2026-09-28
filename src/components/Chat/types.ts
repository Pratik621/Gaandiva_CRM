/** One active campaign under a client — from `GET /api/chat/campaigns`. */
export interface ChatInboxCampaign {
  id: string;
  campaignId: string;
  name: string;
}

/** Client with nested active campaigns (same client can have many campaigns). */
export interface ChatInboxClient {
  id: string;
  companyName: string;
  campaigns: ChatInboxCampaign[];
}

/** One WhatsApp thread per client + campaign — from `GET /api/chat/thread`. */
export interface ClientThread {
  id: string;
  clientId: string;
  companyName: string;
  contactPerson: string | null;
  initials: string;
  avatarHue: number;
  campaignId: string;
  campaignName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  firstContactAt: string;
  hasWhatsApp: boolean;
}

export interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  status?: "sent" | "delivered" | "read" | "failed";
}
