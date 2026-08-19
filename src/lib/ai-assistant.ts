import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/meta";
import { toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { broadcastToAgents } from "@/lib/sse";
import { generateAiReply } from "@/lib/ai-reply";
import { resolveAiLiveState, getHolidayDateKeys, type BusinessHours } from "@/lib/business-hours";
import { notifyCrm } from "@/lib/crm-notify";
import type { WhatsappNumber, Conversation, Contact } from "@prisma/client";

const CONTEXT_MESSAGE_COUNT = 10;

// A real customer reaching out again within this window after our own AI
// already replied doesn't need a second full reply drafted — most commonly
// this fires when the OTHER side's own WhatsApp Business auto-responder
// (a canned "Thanks for contacting us" greeting) sends two separate
// messages seconds apart, which otherwise triggered two near-duplicate
// sales-pitch replies in a row (real production leads 202608, id 236/232 —
// "varun Aqua"/"Earth Electric" — both auto-replied to twice within the
// same minute). A genuine human sending two real messages in a row within
// 5 minutes still only gets one considered reply, which reads fine either
// way ("thanks, and to add...").
const AUTO_REPLY_COOLDOWN_MINUTES = 5;

// What `handleInboundMessage` in api/webhook/route.ts falls back to for any
// message type it still has no real text for (media with no caption/
// filename, unsupported types) — see its `content` derivation. A button
// click or interactive reply now carries the tapped button/list-item's real
// title instead of hitting this fallback, so the AI can respond to those
// meaningfully; this pattern only guards the types that are still a bare
// "[type]" placeholder with nothing for the model to go on. Drafting a
// reply from a bare placeholder is what produced a real, genuinely broken
// reply in production (the model had so little to go on it started asking
// US clarifying questions instead of writing customer-facing text — see
// ai-reply.ts's system prompt for the corresponding guardrail). A human
// should look at these instead.
const NO_TEXT_CONTENT_PATTERN = /^\[.+\]$/;

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
  contact: Contact,
  triggeringMessageContent: string
): Promise<void> {
  try {
    if (conversation.aiMuted) return;
    if (NO_TEXT_CONTENT_PATTERN.test(triggeringMessageContent.trim())) return;

    const holidayDateKeys = await getHolidayDateKeys();
    const isLive = resolveAiLiveState(
      whatsappNumber.aiMode,
      whatsappNumber.businessHours as BusinessHours | null,
      holidayDateKeys
    );
    if (!isLive) return;

    const lastAiReply = await prisma.message.findFirst({
      where: { conversationId: conversation.id, direction: "OUTBOUND", sentByAi: true },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (
      lastAiReply &&
      Date.now() - lastAiReply.createdAt.getTime() < AUTO_REPLY_COOLDOWN_MINUTES * 60 * 1000
    ) {
      return;
    }

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

    notifyCrm({
      phone: contact.phone,
      contactName: contact.name,
      message: reply,
      conversationId: conversation.id,
      whatsappNumber,
      messageId: message.id,
      direction: "outbound",
      senderType: "ai",
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
