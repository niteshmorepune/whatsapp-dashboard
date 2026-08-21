"use client";

import { useEffect, useRef } from "react";
import type { Message, Conversation } from "@/types";

// ─── Typed event payloads ────────────────────────────────────────────────────

export interface SSENewMessageData {
  conversationId: string;
  message: Message;
  conversation: Conversation;
}

export interface SSEMessageStatusData {
  conversationId: string;
  messageId: string;
  status: Message["status"];
  errorMessage?: string | null;
}

export interface SSEConversationUpdatedData {
  conversation: Conversation;
}

export interface SSEConversationAssignedData {
  conversation: Conversation;
  assignedBy: string;
}

export interface SSEHandlers {
  "new-message"?: (data: SSENewMessageData) => void;
  "message-status"?: (data: SSEMessageStatusData) => void;
  "conversation-updated"?: (data: SSEConversationUpdatedData) => void;
  "conversation-assigned"?: (data: SSEConversationAssignedData) => void;
}

// All named events the server ever emits (excluding the keep-alive comment)
const SSE_EVENTS = [
  "new-message",
  "message-status",
  "conversation-updated",
  "conversation-assigned",
] as const;

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Opens a single EventSource to /api/sse and routes named events to the
 * corresponding handler in `handlers`.
 *
 * Handler identity is stabilised via a ref, so callers can pass inline
 * objects/functions without triggering reconnects.
 */
export function useSSE(handlers: SSEHandlers): void {
  // Always holds the latest handlers without causing re-subscription
  const handlersRef = useRef<SSEHandlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource("/api/sse");

    // Register a listener for every event type upfront.
    // Dispatch is deferred to handlersRef so late-arriving state is always used.
    const bound = SSE_EVENTS.map((event) => {
      function listener(e: MessageEvent) {
        try {
          const data = JSON.parse(e.data as string);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (handlersRef.current[event] as any)?.(data);
        } catch {
          // Malformed JSON — skip
        }
      }
      es.addEventListener(event, listener);
      return { event, listener } as const;
    });

    return () => {
      bound.forEach(({ event, listener }) => es.removeEventListener(event, listener));
      es.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps: one persistent EventSource per component mount.
  // The browser's native EventSource already auto-reconnects on drop.
}
