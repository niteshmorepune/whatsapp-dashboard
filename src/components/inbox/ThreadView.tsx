"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import { format, isToday, isYesterday } from "date-fns";
import { CheckCircle, Phone, Loader2, ChevronUp, Bot } from "lucide-react";
import { Conversation, Message } from "@/types";
import { MessageBubble } from "./MessageBubble";
import { MessageInput, TemplatePrefill } from "./MessageInput";
import { WindowBanner } from "./WindowBanner";
import { AssignAgent } from "./AssignAgent";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useSSE } from "@/hooks/useSSE";
import { formatPhone } from "@/lib/utils";
import { toast } from "sonner";

interface ThreadViewProps {
  conversationId: string;
  prefill?: TemplatePrefill | null;
}

function DateDivider({ date }: { date: string }) {
  const d = new Date(date);
  const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-800" />
      <span className="text-xs text-gray-500 px-2">{label}</span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

export function ThreadView({ conversationId, prefill }: ThreadViewProps) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resumingAi, setResumingAi] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const [convRes, msgRes] = await Promise.all([
        axios.get(`/api/conversations/${conversationId}`),
        axios.get(`/api/conversations/${conversationId}/messages?limit=50`),
      ]);
      setConversation(convRes.data);
      setMessages(msgRes.data.messages);
      setNextCursor(msgRes.data.nextCursor);
    } catch {
      toast.error("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetchData();
  }, [fetchData]);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // SSE real-time — filter events to this conversation only
  useSSE({
    "new-message": ({ conversationId: cid, message }) => {
      if (cid !== conversationId) return;
      setMessages((prev) => {
        // Deduplicate: outbound messages are already added optimistically
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    },
    "message-status": ({ conversationId: cid, messageId, status, errorMessage }) => {
      if (cid !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, status, errorMessage: errorMessage ?? null } : m))
      );
    },
  });

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await axios.get(
        `/api/conversations/${conversationId}/messages?cursor=${nextCursor}&limit=50`
      );
      setMessages((prev) => [...res.data.messages, ...prev]);
      setNextCursor(res.data.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleResumeAi() {
    if (!conversation) return;
    setResumingAi(true);
    try {
      await axios.patch(`/api/conversations/${conversationId}`, { aiMuted: false });
      await fetchData(); // re-GET so aiCurrentlyLive (computed server-side) reflects the change
      toast.success("AI assistant resumed on this conversation");
    } catch {
      toast.error("Failed to resume AI");
    } finally {
      setResumingAi(false);
    }
  }

  async function handleResolve() {
    if (!conversation) return;
    const newStatus = conversation.status === "RESOLVED" ? "OPEN" : "RESOLVED";
    setResolving(true);
    try {
      const res = await axios.patch(`/api/conversations/${conversationId}`, {
        status: newStatus,
      });
      setConversation(res.data);
      toast.success(
        newStatus === "RESOLVED" ? "Conversation resolved" : "Conversation reopened"
      );
    } catch {
      toast.error("Failed to update status");
    } finally {
      setResolving(false);
    }
  }

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  for (const msg of messages) {
    const dateKey = msg.createdAt.split("T")[0];
    const lastGroup = groupedMessages[groupedMessages.length - 1];
    if (lastGroup && lastGroup.date === dateKey) {
      lastGroup.messages.push(msg);
    } else {
      groupedMessages.push({ date: dateKey, messages: [msg] });
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (!conversation) return null;

  const contact = conversation.contact;
  const displayName = contact.name ?? contact.phone;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center gap-2 flex-shrink-0">
        {/* Contact info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Avatar name={displayName} size="md" className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-sm font-semibold text-white truncate">{displayName}</h2>
              <Badge
                variant={
                  conversation.status === "OPEN"
                    ? "green"
                    : conversation.status === "PENDING"
                    ? "yellow"
                    : "gray"
                }
              >
                {conversation.status}
              </Badge>
              {conversation.aiCurrentlyLive && !conversation.aiMuted && (
                <Badge variant="green">
                  <Bot className="w-3 h-3 mr-1" /> AI handling
                </Badge>
              )}
              {conversation.aiMuted && (
                <button
                  onClick={handleResumeAi}
                  disabled={resumingAi}
                  title="A human reply muted the AI assistant on this conversation — resume it"
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-800 text-gray-400 border-gray-700 hover:text-white hover:border-gray-600 transition"
                >
                  {resumingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
                  Resume AI
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 text-gray-500 flex-shrink-0" />
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatPhone(contact.phone)}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <AssignAgent
            conversation={conversation}
            onAssigned={setConversation}
          />
          <button
            onClick={handleResolve}
            disabled={resolving}
            title={conversation.status === "RESOLVED" ? "Reopen" : "Resolve"}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex-shrink-0 ${
              conversation.status === "RESOLVED"
                ? "bg-gray-700 hover:bg-gray-600 text-gray-300"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {resolving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3" />
            )}
            <span className="hidden sm:inline">
              {conversation.status === "RESOLVED" ? "Reopen" : "Resolve"}
            </span>
          </button>
        </div>
      </div>

      {/* Window banner */}
      <WindowBanner windowExpiresAt={conversation.windowExpiresAt} />

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-0">
        {nextCursor && (
          <div className="flex justify-center mb-4">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-full transition"
            >
              {loadingMore ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ChevronUp className="w-3 h-3" />
              )}
              Load earlier messages
            </button>
          </div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.date}>
            <DateDivider date={group.date} />
            {group.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        ))}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600">
            <p className="text-sm">No messages yet</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative">
        <MessageInput
          conversationId={conversationId}
          windowExpiresAt={conversation.windowExpiresAt}
          onMessageSent={fetchData}
          prefill={prefill}
        />
      </div>
    </div>
  );
}
