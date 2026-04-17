export type Role = "ADMIN" | "AGENT";
export type ConversationStatus = "OPEN" | "RESOLVED" | "PENDING";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type MessageStatus = "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface Agent {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  status: ConversationStatus;
  lastMessageAt: string;
  windowExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: Contact;
  agent: Agent | null;
  messages?: Message[];
  _count?: { messages: number };
  lastMessage?: Message;
  unreadCount?: number;
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
  sentByAgentId: string | null;
  createdAt: string;
  sentByAgent?: Agent | null;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  isApproved: boolean;
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
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
