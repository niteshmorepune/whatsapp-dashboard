import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents, getConnectedAgentIds } from "@/lib/sse";
import { sendPushToAgents } from "@/lib/webpush";
import { getNumberByPhoneNumberId, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { maybeReplyWithAi } from "@/lib/ai-assistant";
import { notifyCrm, notifyCrmMessageFailed } from "@/lib/crm-notify";
import { extractStatusError } from "@/lib/meta";
import { isOptOutMessage } from "@/lib/opt-out";
import { recordCallSummaryMessage } from "@/lib/call-summary";
import type { WhatsappNumber, CallStatus } from "@prisma/client";

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

        // Handle WhatsApp Calling API events (inbound only, 2026-09-10)
        if (value.calls?.length) {
          const phoneNumberId: string | undefined = value.metadata?.phone_number_id;
          const whatsappNumber = phoneNumberId
            ? await getNumberByPhoneNumberId(phoneNumberId)
            : null;

          if (!whatsappNumber) {
            console.error(
              `Webhook: no WhatsappNumber row matches metadata.phone_number_id="${phoneNumberId}" — call event dropped.`
            );
            continue;
          }

          for (const call of value.calls) {
            await handleCallEvent(call, value.contacts?.[0], whatsappNumber);
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
    // A tap on a template's Quick Reply button (not a URL/phone button —
    // those never generate an inbound webhook event at all).
    button?: { payload: string; text: string };
    // A tap on a non-template interactive message's button/list reply.
    interactive?: {
      type: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string; description?: string };
    };
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
    msg.button?.text ||
    msg.interactive?.button_reply?.title ||
    msg.interactive?.list_reply?.title ||
    msg.errors?.[0]?.title ||
    msg.errors?.[0]?.message ||
    `[${msg.type}]`;
  // The tapped row/button's own stable id, separate from `content` above
  // (which only carries its display title) — the goal-question flow
  // (src/lib/goal-flow.ts) matches on this exact id rather than
  // fuzzy-parsing free text out of a title.
  const interactiveReplyId: string | null =
    msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.id || null;

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

  // A customer's own "stop"/"unsubscribe"-style message is a real opt-out
  // request, not just something the AI should politely acknowledge in text
  // — actually suppress future Broadcasts (which already respect
  // optedOut) and the AI auto-reply (see ai-assistant.ts) for them.
  if (!contact.optedOut && isOptOutMessage(content)) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { optedOut: true },
    });
    contact.optedOut = true;
  }

  const conversation = await findOrCreateConversation(contact.id, whatsappNumber.id);

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
      assignees: { include: { agent: true } },
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
  maybeReplyWithAi(whatsappNumber, conversation, contact, content, interactiveReplyId).catch((error) =>
    console.error("AI after-hours auto-reply failed:", error)
  );
}

/**
 * Find-or-create, scoped per line (a contact who has messaged both numbers
 * gets one conversation per number, never a merged thread). Shared by
 * handleInboundMessage and handleCallEvent — extracted 2026-09-10 once a
 * second real call site existed, to keep the windowExpiresAt/RESOLVED-
 * reopening logic from drifting between the two.
 */
async function findOrCreateConversation(contactId: string, whatsappNumberId: string) {
  const existing = await prisma.conversation.findFirst({
    where: {
      contactId,
      whatsappNumberId,
      status: { in: ["OPEN", "PENDING"] },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  const windowExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (!existing) {
    return prisma.conversation.create({
      data: {
        contactId,
        whatsappNumberId,
        status: "OPEN",
        lastMessageAt: new Date(),
        windowExpiresAt,
      },
    });
  }

  return prisma.conversation.update({
    where: { id: existing.id },
    data: {
      lastMessageAt: new Date(),
      windowExpiresAt,
      status: existing.status === "RESOLVED" ? "OPEN" : existing.status,
    },
  });
}

async function handleStatusUpdate(status: {
  id: string;
  status: string;
  conversation?: { id: string };
  errors?: unknown;
}) {
  const metaMessageId = status.id;
  const newStatus = status.status.toUpperCase() as
    | "SENT"
    | "DELIVERED"
    | "READ"
    | "FAILED";

  // Only ever present (and only ever meaningful) on a FAILED status update —
  // Meta doesn't send errors[] for SENT/DELIVERED/READ.
  const statusError = newStatus === "FAILED" ? extractStatusError(status.errors) : null;

  const message = await prisma.message.findUnique({
    where: { metaMessageId },
    include: { conversation: { select: { whatsappNumberId: true } } },
  });
  if (!message) return;

  const updated = await prisma.message.update({
    where: { id: message.id },
    data: {
      status: newStatus,
      errorCode: statusError?.code ?? null,
      errorMessage: statusError?.message ?? null,
    },
  });

  const eligibleAgentIds = await getAgentIdsWithNumberAccess(message.conversation.whatsappNumberId);
  broadcastToAgents(eligibleAgentIds, "message-status", {
    conversationId: message.conversationId,
    messageId: message.id,
    status: newStatus,
    errorMessage: statusError?.message ?? null,
  });

  if (newStatus === "FAILED") {
    notifyCrmMessageFailed({
      messageId: message.id,
      errorCode: statusError?.code ?? null,
      errorMessage: statusError?.message ?? null,
    });
  }

  return updated;
}

/**
 * WhatsApp Calling API — inbound only. `event: "connect"` is the incoming
 * ring (carries the caller's SDP offer); `event: "terminate"` is the end of
 * a call, answered or not. See src/lib/meta.ts's postCallAction() for the
 * business's own accept/reject/terminate calls this pairs with
 * (api/calls/[callId]/{answer,reject,hangup}/route.ts).
 */
async function handleCallEvent(
  call: {
    id: string;
    event: string;
    from?: string;
    timestamp?: string;
    session?: { sdp_type: string; sdp: string };
    status?: string;
    duration?: number;
  },
  contactInfo: { profile?: { name?: string } } | undefined,
  whatsappNumber: WhatsappNumber
) {
  if (call.event === "connect") {
    if (!call.from || !call.session?.sdp) {
      console.error(`Webhook: calls "connect" event missing from/session.sdp — call ${call.id} dropped`, call);
      return;
    }

    // Dedupe, same convention as handleInboundMessage's metaMessageId check.
    const existing = await prisma.call.findUnique({ where: { metaCallId: call.id } });
    if (existing) return;

    const contact = await prisma.contact.upsert({
      where: { phone: call.from },
      create: { phone: call.from, name: contactInfo?.profile?.name ?? null },
      update: {
        name: contactInfo?.profile?.name ? contactInfo.profile.name : undefined,
      },
    });

    const conversation = await findOrCreateConversation(contact.id, whatsappNumber.id);

    console.log(`Webhook: call ${call.id} connect event, from=${call.from}, timestamp=${call.timestamp}`);

    const created = await prisma.call.create({
      data: {
        metaCallId: call.id,
        conversationId: conversation.id,
        status: "RINGING",
        offerSdp: call.session.sdp,
        startedAt: call.timestamp ? new Date(Number(call.timestamp) * 1000) : new Date(),
      },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumber.id);
    broadcastToAgents(eligibleAgentIds, "incoming-call", {
      callId: created.id,
      conversationId: conversation.id,
      contact: { id: contact.id, name: contact.name, phone: contact.phone },
      offerSdp: call.session.sdp,
    });

    const connectedIds = new Set(getConnectedAgentIds());
    const offlineAgentIds = eligibleAgentIds.filter((id) => !connectedIds.has(id));
    if (offlineAgentIds.length > 0) {
      await sendPushToAgents(offlineAgentIds, {
        title: `Incoming call from ${contact.name || `+${contact.phone}`}`,
        body: "Tap to answer in wadesk",
        conversationId: conversation.id,
        url: "/inbox",
      });
    }
    return;
  }

  if (call.event === "terminate") {
    const existingCall = await prisma.call.findUnique({ where: { metaCallId: call.id } });
    if (!existingCall) return; // unrecognized id -- harmless no-op, same convention used elsewhere in this app

    // Already resolved by our own answer/reject/hangup route (whichever
    // raced first) -- Meta's terminate webhook arriving after that is a
    // harmless no-op, not a second source of truth to overwrite a correct
    // COMPLETED/REJECTED status with a guessed one.
    if (existingCall.status !== "RINGING" && existingCall.status !== "ANSWERED") {
      return;
    }

    // Meta's exact terminate `status` string set isn't fully pinned down
    // from docs alone -- logged so the first real calls can confirm/correct
    // this mapping (see the calling-feature plan's own "Risks" section).
    console.log(
      `Webhook: call ${call.id} terminate event, raw status=${JSON.stringify(call.status)}, duration=${call.duration}`
    );

    const wasAnswered = existingCall.status === "ANSWERED";
    const rawStatus = String(call.status ?? "").toLowerCase();
    const status: CallStatus = rawStatus.includes("fail") ? "FAILED" : wasAnswered ? "COMPLETED" : "MISSED";
    const endedAt = new Date();
    const durationSeconds =
      typeof call.duration === "number"
        ? call.duration
        : existingCall.answeredAt
          ? Math.round((endedAt.getTime() - existingCall.answeredAt.getTime()) / 1000)
          : null;

    await prisma.call.update({
      where: { id: existingCall.id },
      data: { status, endedAt, durationSeconds },
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id: existingCall.conversationId },
      select: { whatsappNumberId: true },
    });
    if (!conversation) return;

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(conversation.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "call-ended", {
      callId: existingCall.id,
      conversationId: existingCall.conversationId,
      status,
    });
    await recordCallSummaryMessage(
      existingCall.conversationId,
      conversation.whatsappNumberId,
      existingCall.metaCallId,
      status,
      durationSeconds
    );
    return;
  }

  console.log(`Webhook: unhandled call event "${call.event}" for call ${call.id} — ignored`);
}
