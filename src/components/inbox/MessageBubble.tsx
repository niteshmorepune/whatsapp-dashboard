import { Message } from "@/types";
import { format } from "date-fns";
import { Check, CheckCheck, Clock, XCircle, FileText, Download } from "lucide-react";
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

export function MessageBubble({ message }: MessageBubbleProps) {
  const isOutbound = message.direction === "OUTBOUND";
  const mediaUrl = `/api/media/${message.mediaUrl}?conversationId=${message.conversationId}`;

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
        {/* Media content */}
        {message.mediaType && message.mediaUrl && (
          <div className="mb-2">
            {message.mediaType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt="image"
                className="rounded-lg max-w-full max-h-64 object-contain cursor-pointer"
                onClick={() => window.open(mediaUrl, "_blank")}
              />
            ) : message.mediaType === "audio" ? (
              <audio controls src={mediaUrl} className="w-full max-w-xs" />
            ) : message.mediaType === "video" ? (
              <video
                controls
                src={mediaUrl}
                className="rounded-lg max-w-full max-h-48"
              />
            ) : (
              <a
                href={`${mediaUrl}&download=1&filename=${encodeURIComponent(message.content || "file")}`}
                download={message.content || "file"}
                className="flex items-center gap-2 bg-black/20 hover:bg-black/30 rounded-lg px-3 py-2 transition"
                onClick={(e) => e.stopPropagation()}
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs truncate flex-1">{message.content || "Document"}</span>
                <Download className="w-3 h-3 flex-shrink-0" />
              </a>
            )}
          </div>
        )}

        {/* Text / caption — hide if it's a doc filename already shown inside the download link */}
        {(message.content && message.mediaType !== "document") || !message.mediaType ? (
          <p className="text-sm text-white leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        ) : null}

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
