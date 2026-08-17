import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { sendTextMessage, sendTemplateMessage, sendMediaMessage } from "@/lib/meta";
import { agentHasAccessToNumber, toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { notifyCrm } from "@/lib/crm-notify";

const MEDIA_TYPES = ["image", "document", "audio", "video"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
import { isWindowExpired } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    // CRM server-to-server auth via X-Service-Key (Tier 3: staff replies to a
    // WhatsApp ticket in the CRM, forwarded here with no browser session).
    // Trusted via the shared secret in place of a human agent identity — so
    // it skips both getServerSession and the per-agent line-access check
    // below (there's no agent to check access for; the CRM speaks for
    // itself). middleware.ts excludes /api/send from NextAuth's route
    // matcher so this request path reaches the handler at all.
    const serviceKey = request.headers.get("X-Service-Key");
    const isCrmRequest = Boolean(serviceKey && serviceKey === process.env.WADESK_SERVICE_KEY);

    let session = null;
    if (!isCrmRequest) {
      session = await getServerSession(authOptions);
      if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, content, type = "text", templateId, mediaId, filename } = body;

    if (!conversationId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!content && !mediaId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true, whatsappNumber: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (!isCrmRequest) {
      const allowed = await agentHasAccessToNumber(
        session!.user.id,
        session!.user.role,
        conversation.whatsappNumberId
      );
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const metaConfig = toMetaConfig(conversation.whatsappNumber);
    const windowExpired = isWindowExpired(conversation.windowExpiresAt);

    if (type !== "template" && windowExpired) {
      return NextResponse.json(
        { error: "24-hour window has expired. Please use a template." },
        { status: 403 }
      );
    }

    const phone = conversation.contact.phone;
    let metaMessageId: string | null = null;

    if (type === "template" && templateId) {
      const template = await prisma.template.findUnique({
        where: { id: templateId },
      });
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
      const result = await sendTemplateMessage(metaConfig, phone, template.name, template.language);
      metaMessageId = result.messageId ?? null;
    } else if (MEDIA_TYPES.includes(type as MediaType)) {
      if (!mediaId) {
        return NextResponse.json({ error: "mediaId required for media messages" }, { status: 400 });
      }
      const result = await sendMediaMessage(metaConfig, phone, type as MediaType, mediaId, content || undefined, filename);
      metaMessageId = result.messageId ?? null;
    } else {
      const result = await sendTextMessage(metaConfig, phone, content);
      metaMessageId = result.messageId ?? null;
    }

    // Save message
    const message = await prisma.message.create({
      data: {
        conversationId,
        direction: "OUTBOUND",
        content: content ?? "",
        metaMessageId,
        mediaUrl: MEDIA_TYPES.includes(type as MediaType) ? (mediaId ?? null) : null,
        mediaType: MEDIA_TYPES.includes(type as MediaType) ? type : null,
        status: "SENT",
        sentByAgentId: isCrmRequest ? null : session!.user.id,
      },
      include: { sentByAgent: true },
    });

    // Notify the CRM of a human agent's reply sent directly from this app
    // (never for a CRM-originated send — the CRM already recorded that
    // message itself the moment it sent it, so re-notifying it here would
    // just be a redundant echo of its own data).
    if (!isCrmRequest) {
      notifyCrm({
        phone: conversation.contact.phone,
        contactName: conversation.contact.name,
        message: content ?? "",
        conversationId,
        whatsappNumber: conversation.whatsappNumber,
        mediaId: message.mediaUrl,
        mediaType: message.mediaType,
        messageId: message.id,
        direction: "outbound",
        senderType: "agent",
        senderName: message.sentByAgent?.name ?? null,
      });
    }

    // Update conversation — aiMuted is set unconditionally: every message
    // reaching this route is human-originated (a session agent, or a CRM
    // staff reply forwarded via the service key), never the AI assistant
    // itself (it sends directly via Meta + ai-assistant.ts, bypassing this
    // route), so any send here means "a human is handling this" and the AI
    // after-hours assistant should stop replying until manually resumed.
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), aiMuted: true },
      include: { contact: true, agent: true },
    });

    // SSE broadcast only to agents granted this conversation's line
    const eligibleAgentIds = await getAgentIdsWithNumberAccess(conversation.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "new-message", {
      conversationId,
      message,
      conversation: updatedConversation,
    });
    broadcastToAgents(eligibleAgentIds, "conversation-updated", {
      conversation: updatedConversation,
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("Send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
