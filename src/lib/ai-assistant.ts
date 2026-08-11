import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/meta";
import { toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { broadcastToAgents } from "@/lib/sse";
import { generateAiReply } from "@/lib/ai-reply";
import { resolveAiLiveState, getHolidayDateKeys, type BusinessHours } from "@/lib/business-hours";
import type { WhatsappNumber, Conversation, Contact } from "@prisma/client";

const CONTEXT_MESSAGE_COUNT = 10;

/**
 * Called after every inbound message is saved (see api/webhook). Decides
 * whether the AI after-hours assistant should answer this conversation right
 * now, and if so, drafts, sends, persists, and broadcasts the reply exactly
 * like a normal outbound send. Fire-and-forget from the caller — this
 * function swallows its own errors so a Meta/Anthropic hiccup can never
 * break inbound message handling.
 */
export async function maybeReplyWithAi(
  whatsappNumber: WhatsappNumber,
  conversation: Conversation,
  contact: Contact
): Promise<void> {
  try {
    if (conversation.aiMuted) return;

    const holidayDateKeys = await getHolidayDateKeys();
    const isLive = resolveAiLiveState(
      whatsappNumber.aiMode,
      whatsappNumber.businessHours as BusinessHours | null,
      holidayDateKeys
    );
    if (!isLive) return;

    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_MESSAGE_COUNT,
      select: { direction: true, content: true },
    });
    recentMessages.reverse();

    const reply = await generateAiReply({
      contactName: contact.name,
      recentMessages,
      whatsappNumberId: whatsappNumber.id,
      whatsappNumberLabel: whatsappNumber.label,
    });
    if (!reply) return;

    const metaConfig = toMetaConfig(whatsappNumber);
    const result = await sendTextMessage(metaConfig, contact.phone, reply);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: reply,
        metaMessageId: result.messageId ?? null,
        status: "SENT",
        sentByAgentId: null,
        sentByAi: true,
      },
    });

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
      include: { contact: true, agent: true },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumber.id);
    broadcastToAgents(eligibleAgentIds, "new-message", {
      conversationId: conversation.id,
      message,
      conversation: updatedConversation,
    });
    broadcastToAgents(eligibleAgentIds, "conversation-updated", {
      conversation: updatedConversation,
    });
  } catch (error) {
    console.error("AI after-hours auto-reply failed:", error);
  }
}
