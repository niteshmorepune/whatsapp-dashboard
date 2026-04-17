import { cn } from "@/lib/utils";
import type { ConversationStatus } from "@/types";

interface StatusDotProps {
  status: ConversationStatus;
  className?: string;
}

const statusColors: Record<ConversationStatus, string> = {
  OPEN: "bg-green-500",
  PENDING: "bg-yellow-500",
  RESOLVED: "bg-gray-500",
};

export function StatusDot({ status, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full",
        statusColors[status],
        className
      )}
    />
  );
}
