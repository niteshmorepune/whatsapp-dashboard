import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import type { CallStatus } from "@prisma/client";

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function summaryText(status: CallStatus, durationSeconds: number | null): string {
  switch (status) {
    case "COMPLETED":
      return `📞 Call answered — ${formatDuration(durationSeconds)}`;
    case "MISSED":
      return "📞 Missed call";
    case "REJECTED":
      return "📞 Call declined";
    case "FAILED":
      return "📞 Call failed to connect";
    default:
      return "📞 Call ended";
  }
}

/**
 * Makes a resolved call visible in the ordinary chat thread, reusing the
 * existing Message/MessageBubble rendering rather than building a parallel
 * call-history UI (deliberately deferred at first, per the calling-feature
 * plan -- added same day once the owner asked to actually see calls in the
 * thread while live-testing).
 *
 * Called from two independent places -- the webhook's terminate handler
 * (Meta-reported outcome: missed/failed/caller-hung-up) AND the
 * agent-initiated hangup/reject routes (which resolve the Call row
 * themselves and don't depend on Meta's terminate webhook ever arriving,
 * unlike the webhook path -- a real gap found the same day this shipped:
 * a live test call's terminate webhook never arrived at all, leaving the
 * wadesk UI stuck showing a running timer long after the caller had
 * hung up). Deduped via a `call:`-prefixed synthetic metaMessageId so
 * both call sites can safely resolve the same call without double-logging
 * it if, say, an agent hangs up right as Meta's own webhook also arrives.
 */
export async function recordCallSummaryMessage(
  conversationId: string,
  whatsappNumberId: string,
  metaCallId: string,
  status: CallStatus,
  durationSeconds: number | null
): Promise<void> {
  const syntheticId = `call:${metaCallId}`;
  const existing = await prisma.message.findUnique({ where: { metaMessageId: syntheticId } });
  if (existing) return;

  const message = await prisma.message.create({
    data: {
      conversationId,
      direction: "INBOUND",
      content: summaryText(status, durationSeconds),
      metaMessageId: syntheticId,
      status: "DELIVERED",
    },
  });

  const fullConversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { contact: true, assignees: { include: { agent: true } } },
  });

  const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumberId);
  broadcastToAgents(eligibleAgentIds, "new-message", { conversationId, message, conversation: fullConversation });
  broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: fullConversation });
}
