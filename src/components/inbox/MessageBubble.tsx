import { Message } from "@/types";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, XCircle, Image as ImageIcon, FileText, Headphones, Video } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: Message;
}

function StatusTick({ status }: { status: Message["status"] }) {
  switch (status) {
    case "SENT":
      return <Check className="w-3 h-3 text-gray-400" />;
    case "DELIVERED":
      return <CheckCheck className="w-3 h-3 text-gray-400" />;
    case "READ":
      return <CheckCheck className="w-3 h-3 text-blue-400" />;
    case "FAILED":
      return <XCircle className="w-3 h-3 text-red-400" />;
    default:
      return <Clock className="w-3 h-3 text-gray-500" />;
  }
}

function MediaIcon({ type }: { type: string | null }) {
  switch (type) {
    case "image": return <ImageIcon className="w-4 h-4" />;
    case "document": return <FileText className="w-4 h-4" />;
    case "audio": return <Headphones className="w-4 h-4" />;
    case "video": return <Video className="w-4 h-4" />;
    default: return null;
  }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "OUTBOUND";

  return (
    <div
      className={cn(
        "flex mb-2",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm",
          isOutbound
            ? "bg-green-600 rounded-tr-sm"
            : "bg-gray-800 rounded-tl-sm"
        )}
      >
        {/* Media indicator */}
        {message.mediaType && (
          <div className="flex items-center gap-1.5 mb-1 opacity-75">
            <MediaIcon type={message.mediaType} />
            <span className="text-xs capitalize">{message.mediaType}</span>
          </div>
        )}

        <p className="text-sm text-white leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>

        <div
          className={cn(
            "flex items-center gap-1 mt-1",
            isOutbound ? "justify-end" : "justify-start"
          )}
        >
          <span className="text-[10px] text-white/50">
            {format(new Date(message.createdAt), "HH:mm")}
          </span>
          {isOutbound && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}
