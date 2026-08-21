export type Role = "ADMIN" | "AGENT";
export type ConversationStatus = "OPEN" | "RESOLVED" | "PENDING";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";
export type AiMode = "AUTO" | "FORCE_ON" | "FORCE_OFF";

export interface DayHours {
  day: number; // 0=Sun .. 6=Sat
  isOpen: boolean;
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
}

export interface WhatsappNumber {
  id: string;
  label: string;
  businessNumber: string;
  isDefault: boolean;
  createdAt: string;
  phoneNumberId?: string;
  wabaId?: string;
  aiMode?: AiMode;
  businessHours?: DayHours[] | null;
  aiCurrentlyLive?: boolean;
  _count?: { conversations: number };
}

export interface Holiday {
  id: string;
  date: string;
  label: string;
  createdAt: string;
}

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  isActive: boolean;
  whatsappNumberId: string | null;
  whatsappNumber: { id: string; label: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  whatsappNumberGrants?: { whatsappNumber: Pick<WhatsappNumber, "id" | "label" | "businessNumber"> }[];
}

export interface Contact {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  tags: string[];
  optedOut: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  contactId: string;
  agentId: string | null;
  whatsappNumberId: string;
  status: ConversationStatus;
  lastMessageAt: string;
  windowExpiresAt: string | null;
  aiMuted: boolean;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  agent: Agent | null;
  whatsappNumber?: WhatsappNumber;
  messages?: Message[];
  _count?: { messages: number };
  lastMessage?: Message;
  unreadCount?: number;
  aiCurrentlyLive?: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  metaMessageId: string | null;
  status: MessageStatus;
  errorCode: number | null;
  errorMessage: string | null;
  sentByAgentId: string | null;
  sentByAi: boolean;
  createdAt: string;
  sentByAgent?: Agent | null;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  language: string;
  hasButtonParam: boolean;
  isApproved: boolean;
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuickReply {
  id: string;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactNote {
  id: string;
  contactId: string;
  agentId: string;
  content: string;
  createdAt: string;
  agent: { id: string; name: string };
}

export type BroadcastStatus = "DRAFT" | "SENDING" | "COMPLETED" | "FAILED";
export type RecipientStatus = "PENDING" | "SENT" | "FAILED";

export interface Broadcast {
  id: string;
  name: string;
  templateId: string;
  agentId: string;
  whatsappNumberId: string;
  variables?: string[] | null;
  buttonUrlParam?: string | null;
  status: BroadcastStatus;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  template?: { id: string; name: string };
  agent?: { id: string; name: string };
  whatsappNumber?: { id: string; label: string; businessNumber: string };
  recipients?: BroadcastRecipient[];
  _count?: { recipients: number };
}

export interface BroadcastRecipient {
  id: string;
  broadcastId: string;
  contactId: string;
  status: RecipientStatus;
  metaMessageId: string | null;
  createdAt: string;
  contact?: { id: string; name: string | null; phone: string };
}

export interface PusherNewMessageEvent {
  message: Message;
  conversation: Conversation;
}

export interface PusherMessageStatusEvent {
  messageId: string;
  status: MessageStatus;
}

export interface PusherConversationUpdatedEvent {
  conversation: Conversation;
}

export interface AnalyticsData {
  totalToday: number;
  openConversations: number;
  avgResponseTime: number;
  messagesToday: number;
  messagesPerDay: { date: string; count: number }[];
  conversationsByStatus: { status: string; count: number }[];
  agentPerformance: {
    agentId: string;
    agentName: string;
    handled: number;
    avgResponseTime: number;
  }[];
}

// NextAuth type augmentation
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
  }
}
