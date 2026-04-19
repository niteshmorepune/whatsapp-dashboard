"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { Search } from "lucide-react";
import { Conversation, ConversationStatus } from "@/types";
import { ConversationItem } from "./ConversationItem";
import { useSSE } from "@/hooks/useSSE";
import { cn } from "@/lib/utils";

interface ConversationListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const TABS: { label: string; value: ConversationStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Open", value: "OPEN" },
  { label: "Pending", value: "PENDING" },
  { label: "Resolved", value: "RESOLVED" },
];

const BASE_TITLE = "WhatsApp Business Dashboard";

// Plays a short descending sine-wave ping via Web Audio API.
// Creates a fresh context each time and closes it when the note ends.
function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const Ctx =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch {
    /* audio unavailable or blocked */
  }
}

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status, setStatus] = useState<ConversationStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  // ── Browser notification permission ──────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ── Tab title badge ───────────────────────────────────────────────────────
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [totalUnread]);

  // ── Conversations fetch ───────────────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (search) params.set("search", search);
      const res = await axios.get(`/api/conversations?${params}`);
      setConversations(res.data.conversations);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(fetchConversations, 300);
    return () => clearTimeout(t);
  }, [fetchConversations]);

  // ── SSE real-time updates ─────────────────────────────────────────────────
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useSSE({
    "conversation-updated": ({ conversation }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversation.id);
        const next =
          idx === -1
            ? [conversation, ...prev]
            : prev.map((c, i) => (i === idx ? { ...c, ...conversation } : c));
        return next.sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime()
        );
      });
    },

    "new-message": ({ conversation, message }) => {
      // Always keep the list fresh
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conversation.id);
        const next =
          idx === -1
            ? [conversation, ...prev]
            : prev.map((c, i) => (i === idx ? { ...c, ...conversation } : c));
        return next.sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime()
        );
      });

      // Notify only for conversations the agent isn't currently viewing
      if (conversation.id !== selectedIdRef.current) {
        // Unread badge
        setUnreadCounts((prev) => ({
          ...prev,
          [conversation.id]: (prev[conversation.id] ?? 0) + 1,
        }));

        // Sound ping
        playNotificationSound();

        // Browser notification popup (works even if tab is in background)
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          const name = conversation.contact?.name ?? conversation.contact?.phone ?? "New message";
          const body = message.mediaType
            ? `Sent ${message.mediaType === "image" ? "an image" : message.mediaType === "audio" ? "a voice message" : message.mediaType === "video" ? "a video" : "a document"}`
            : message.content || "New message";
          const notif = new Notification(name, {
            body,
            icon: "/favicon.ico",
            tag: conversation.id, // replaces previous notification for same conversation
          });
          notif.onclick = () => window.focus();
        }
      }
    },
  });

  // Clear unread when conversation selected
  useEffect(() => {
    if (selectedId) {
      setUnreadCounts((prev) => ({ ...prev, [selectedId]: 0 }));
    }
  }, [selectedId]);

  return (
    <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800">
      {/* Search */}
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex border-b border-gray-800 px-2">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={cn(
              "flex-1 py-2 text-xs font-medium transition-colors",
              status === tab.value
                ? "text-green-400 border-b-2 border-green-400"
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-0">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 border-b border-gray-800/50">
                <div className="w-9 h-9 rounded-full bg-gray-800 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-800 rounded animate-pulse w-3/4" />
                  <div className="h-2 bg-gray-800 rounded animate-pulse w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-600">
            <Search className="w-8 h-8 mb-2" />
            <p className="text-sm">No conversations found</p>
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isSelected={conv.id === selectedId}
              onClick={() => onSelect(conv.id)}
              unreadCount={unreadCounts[conv.id] ?? 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
