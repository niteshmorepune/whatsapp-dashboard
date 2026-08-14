import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents, getConnectedAgentIds } from "@/lib/sse";
import { sendPushToAgents } from "@/lib/webpush";
import { getNumberByPhoneNumberId, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { maybeReplyWithAi } from "@/lib/ai-assistant";
import { notifyCrm } from "@/lib/crm-notify";
import type { WhatsappNumber } from "@prisma/client";

// GET: Meta webhook verification
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// POST: Incoming webhook events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" });
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        // Handle inbound messages
        if (value.messages?.length) {
          const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
          const whatsappNumber = phoneNumberId
            ? await getNumberByPhoneNumberId(phoneNumberId)
            : null;

          if (!whatsappNumber) {
            console.error(
              `Webhook: no WhatsappNumber row matches metadata.phone_number_id="${phoneNumberId}" — message dropped. Add this number via /numbers first.`
            );
            continue;
          }

          for (const msg of value.messages) {
            await handleInboundMessage(msg, value.contacts?.[0], whatsappNumber);
          }
        }

        // Handle status updates
        if (value.statuses?.length) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }
      }
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    // Always return 200 to Meta
    return NextResponse.json({ status: "ok" });
  }
}

async function handleInboundMessage(
  msg: {
    id: string;
    from: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: { id: string; mime_type: string; caption?: string };
    document?: { id: string; mime_type: string; filename?: string };
    audio?: { id: string; mime_type: string };
    video?: { id: string; mime_type: string };
    errors?: { title?: string; message?: string }[];
  },
  contactInfo: { profile?: { name?: string } } | undefined,
  whatsappNumber: WhatsappNumber
) {
  const phone = msg.from;
  const metaMessageId = msg.id;
  const content =
    msg.text?.body ||
    msg.image?.caption ||
    msg.document?.filename ||
    msg.errors?.[0]?.title ||
    msg.errors?.[0]?.message ||
    `[${msg.type}]`;

  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  if (msg.image) {
    mediaType = "image";
    mediaUrl = msg.image.id;
  } else if (msg.document) {
    mediaType = "document";
    mediaUrl = msg.document.id;
  } else if (msg.audio) {
    mediaType = "audio";
    mediaUrl = msg.audio.id;
  } else if (msg.video) {
    mediaType = "video";
    mediaUrl = msg.video.id;
  }

  // Find or create contact
  const contact = await prisma.contact.upsert({
    where: { phone },
    create: {
      phone,
      name: contactInfo?.profile?.name ?? null,
    },
    update: {
      name: contactInfo?.profile?.name
        ? contactInfo.profile.name
        : undefined,
    },
  });

  // Find or create conversation — scoped per line, so a contact who has
  // messaged both numbers (e.g. a lead on the marketing line who later
  // texts the support line directly) gets one conversation per number,
  // never one merged thread.
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      whatsappNumberId: whatsappNumber.id,
      status: { in: ["OPEN", "PENDING"] },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        whatsappNumberId: whatsappNumber.id,
        status: "OPEN",
        lastMessageAt: new Date(),
        windowExpiresAt,
      },
    });
  } else {
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        windowExpiresAt,
        status: conversation.status === "RESOLVED" ? "OPEN" : conversation.status,
      },
    });
  }

  // Skip non-meaningful message types (reactions, unsupported, system events)
  if (msg.type === "unsupported" || msg.type === "reaction" || msg.type === "system") {
    return;
  }

  // Save message (skip duplicates)
  const existing = await prisma.message.findUnique({
    where: { metaMessageId },
  });
  if (existing) return;

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      content,
      mediaUrl,
      mediaType,
      metaMessageId,
      status: "DELIVERED",
    },
  });

  // Notify the CRM of every real inbound message (not just a new/reopened
  // conversation's opening one) so it can build a full timeline — see
  // crm-notify.ts. Uses this message's own id, not metaMessageId, as the
  // CRM-side idempotency key (stable regardless of how Meta's own id is
  // formatted).
  notifyCrm({
    phone,
    contactName: contactInfo?.profile?.name ?? null,
    message: content,
    conversationId: conversation.id,
    whatsappNumber,
    // Meta media ID (not a URL — the CRM resolves it via our own
    // /api/media/[id] proxy, service-key-authed) so the CRM can fetch
    // and store the actual file instead of only ever seeing the
    // "[image]"/"[document]" placeholder text in `content`.
    mediaId: mediaUrl,
    mediaType,
    messageId: message.id,
    direction: "inbound",
    senderType: "customer",
  });

  // Load full conversation for SSE broadcast
  const fullConversation = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: {
      contact: true,
      agent: true,
    },
  });

  // Broadcast only to agents granted this conversation's line
  const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumber.id);
  broadcastToAgents(eligibleAgentIds, "new-message", {
    conversationId: conversation.id,
    message,
    conversation: fullConversation,
  });
  broadcastToAgents(eligibleAgentIds, "conversation-updated", {
    conversation: fullConversation,
  });

  // Push notification to eligible agents who are NOT currently connected via SSE
  const connectedIds = new Set(getConnectedAgentIds());
  const offlineAgentIds = eligibleAgentIds.filter((id) => !connectedIds.has(id));
  if (offlineAgentIds.length > 0) {
    const senderName = contact.name || `+${phone}`;
    const preview = content.length > 100 ? content.slice(0, 100) + "…" : content;
    await sendPushToAgents(offlineAgentIds, {
      title: `New message from ${senderName}`,
      body: preview,
      conversationId: conversation.id,
      url: "/inbox",
    });
  }

  // AI after-hours assistant — decides for itself (line's AiMode + business
  // hours/holidays + this conversation's aiMuted flag) whether to reply.
  // Fire-and-forget: never blocks or fails the Meta webhook response.
  maybeReplyWithAi(whatsappNumber, conversation, contact).catch((error) =>
    console.error("AI after-hours auto-reply failed:", error)
  );
}

async function handleStatusUpdate(status: {
  id: string;
  status: string;
  conversation?: { id: string };
}) {
  const metaMessageId = status.id;
  const newStatus = status.status.toUpperCase() as
    | "SENT"
    | "DELIVERED"
    | "READ"
    | "FAILED";

  const message = await prisma.message.findUnique({
    where: { metaMessageId },
    include: { conversation: { select: { whatsappNumberId: true } } },
  });
  if (!message) return;

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: { status: newStatus },
  });

  const eligibleAgentIds = await getAgentIdsWithNumberAccess(message.conversation.whatsappNumberId);
  broadcastToAgents(eligibleAgentIds, "message-status", {
    conversationId: message.conversationId,
    messageId: message.id,
    status: newStatus,
  });

  return updated;
}
