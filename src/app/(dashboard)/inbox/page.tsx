"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ThreadView } from "@/components/inbox/ThreadView";
import { TemplatePrefill } from "@/components/inbox/MessageInput";

// Deep link support: ?conversation=<id>&template=<name>&var1=<value>&buttonParam=<value>
// — e.g. the CRM's Visibility Audit recovery worklist links straight into a
// lead's own conversation with the right recovery template ready to review.
// `prefill` is only ever applied to the conversation the link itself named
// (see handleSelect below) so clicking into a different conversation
// afterwards never carries a stale template prefill with it.
function InboxContent() {
  const searchParams = useSearchParams();
  const initialConversationId = searchParams.get("conversation");

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialConversationId
  );
  const [prefill, setPrefill] = useState<TemplatePrefill | null>(() => {
    const templateName = searchParams.get("template");
    if (!initialConversationId || !templateName) return null;
    return {
      templateName,
      var1: searchParams.get("var1") ?? undefined,
      buttonUrlParam: searchParams.get("buttonParam") ?? undefined,
    };
  });

  function handleSelect(id: string) {
    if (id !== selectedConversationId) setPrefill(null);
    setSelectedConversationId(id);
  }

  return (
    <div className="h-full flex">
      {/* Conversation list - 1/3 width on desktop */}
      <div
        className={`${
          selectedConversationId ? "hidden lg:flex" : "flex"
        } w-full lg:w-80 xl:w-96 flex-col flex-shrink-0`}
      >
        <ConversationList selectedId={selectedConversationId} onSelect={handleSelect} />
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
            <ThreadView
              key={selectedConversationId}
              conversationId={selectedConversationId}
              prefill={prefill}
            />
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

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxContent />
    </Suspense>
  );
}
