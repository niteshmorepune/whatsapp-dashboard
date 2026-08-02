import { Conversation } from "@/types";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn, formatMessageTime, truncate } from "@/lib/utils";

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onClick: () => void;
  unreadCount?: number;
  showLineBadge?: boolean;
}

export function ConversationItem({
  conversation,
  isSelected,
  onClick,
  unreadCount = 0,
  showLineBadge = false,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact.name ?? contact.phone;
  const lastMessage = conversation.messages?.[0];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left border-b border-gray-800/50",
        isSelected && "bg-gray-800 border-l-2 border-l-green-500"
      )}
    >
      <Avatar name={displayName} size="md" className="mt-0.5" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className={cn(
              "text-sm font-medium truncate",
              isSelected ? "text-white" : "text-gray-200"
            )}
          >
            {displayName}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {unreadCount > 0 && (
              <span className="bg-green-500 text-white text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {formatMessageTime(conversation.lastMessageAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot status={conversation.status} className="flex-shrink-0" />
          <span className="text-xs text-gray-400 truncate">
            {lastMessage ? truncate(lastMessage.content, 45) : "No messages yet"}
          </span>
          {showLineBadge && conversation.whatsappNumber && (
            <span className="text-[10px] text-gray-500 bg-gray-800 rounded px-1.5 py-0.5 flex-shrink-0">
              {conversation.whatsappNumber.label}
            </span>
          )}
        </div>

        {conversation.agent && (
          <span className="text-xs text-gray-600 mt-0.5 block">
            Assigned: {conversation.agent.name}
          </span>
        )}
      </div>
    </button>
  );
}
