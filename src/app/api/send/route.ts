import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAll } from "@/lib/sse";
import { sendTextMessage, sendTemplateMessage, sendMediaMessage } from "@/lib/meta";

const MEDIA_TYPES = ["image", "document", "audio", "video"] as const;
type MediaType = (typeof MEDIA_TYPES)[number];
import { isWindowExpired } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
      include: { contact: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

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
      const result = await sendTemplateMessage(phone, template.name);
      metaMessageId = result.messageId ?? null;
    } else if (MEDIA_TYPES.includes(type as MediaType)) {
      if (!mediaId) {
        return NextResponse.json({ error: "mediaId required for media messages" }, { status: 400 });
      }
      const result = await sendMediaMessage(phone, type as MediaType, mediaId, content || undefined, filename);
      metaMessageId = result.messageId ?? null;
    } else {
      const result = await sendTextMessage(phone, content);
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
        sentByAgentId: session.user.id,
      },
      include: { sentByAgent: true },
    });

    // Update conversation
    const updatedConversation = await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
      include: { contact: true, agent: true },
    });

    // SSE broadcast to all connected agents
    broadcastToAll("new-message", {
      conversationId,
      message,
      conversation: updatedConversation,
    });
    broadcastToAll("conversation-updated", {
      conversation: updatedConversation,
    });

    return NextResponse.json(message);
  } catch (error) {
    console.error("Send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
