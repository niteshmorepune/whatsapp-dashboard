"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ThreadView } from "@/components/inbox/ThreadView";

export default function InboxPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  return (
    <div className="h-full flex">
      {/* Conversation list - 1/3 width on desktop */}
      <div
        className={`${
          selectedConversationId ? "hidden lg:flex" : "flex"
        } w-full lg:w-80 xl:w-96 flex-col flex-shrink-0`}
      >
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={(id) => setSelectedConversationId(id)}
        />
      </div>

      {/* Thread view - 2/3 width on desktop */}
      <div
        className={`${
          selectedConversationId ? "flex" : "hidden lg:flex"
        } flex-1 flex-col`}
      >
        {selectedConversationId ? (
          <>
            {/* Mobile back button */}
            <div className="lg:hidden px-4 py-2 bg-gray-900 border-b border-gray-800">
              <button
                onClick={() => setSelectedConversationId(null)}
                className="text-sm text-green-400 hover:text-green-300 transition"
              >
                ← Back to conversations
              </button>
            </div>
            <ThreadView key={selectedConversationId} conversationId={selectedConversationId} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 bg-gray-950">
            <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a conversation</p>
            <p className="text-sm mt-1 opacity-70">
              Choose from the list to start chatting
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
