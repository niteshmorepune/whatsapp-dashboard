import type { WhatsappNumber } from "@prisma/client";

type NotifyDirection = "inbound" | "outbound";
type NotifySenderType = "customer" | "agent" | "ai";

interface NotifyCrmParams {
  phone: string;
  contactName?: string | null;
  message: string;
  conversationId: string;
  whatsappNumber: WhatsappNumber;
  mediaId?: string | null;
  mediaType?: string | null;
  messageId: string;
  direction: NotifyDirection;
  senderType: NotifySenderType;
  senderName?: string | null;
}

/**
 * Forwards a WhatsApp message to the NEDS CRM so it can build a full,
 * ordered communication timeline on the matching Lead/Ticket — every
 * inbound customer message AND every outbound reply (a human agent sending
 * from this app directly, or the AI after-hours assistant), not just a
 * conversation's opening message as this app used to notify on.
 *
 * Deliberately NOT called for a CRM-originated send (X-Service-Key auth on
 * /api/send) — the CRM already recorded that message itself the moment it
 * sent it, so echoing it back here would be redundant. See
 * WhatsappWebhookController on the CRM side for the receiving end of this
 * contract (message_id/direction/sender_type are all optional there, so an
 * older build of this app — or this app before this function existed —
 * remains compatible).
 *
 * Fire-and-forget: never awaited by callers, and any failure here must
 * never affect message delivery/persistence on this side.
 */
export function notifyCrm(params: NotifyCrmParams): void {
  if (!process.env.CRM_WEBHOOK_URL || !process.env.CRM_WEBHOOK_TOKEN) return;

  fetch(process.env.CRM_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRM_WEBHOOK_TOKEN}`,
    },
    body: JSON.stringify({
      phone: params.phone,
      contact_name: params.contactName ?? null,
      message: params.message,
      conversation_id: params.conversationId,
      whatsapp_number: params.whatsappNumber.businessNumber,
      whatsapp_line_label: params.whatsappNumber.label,
      media_id: params.mediaId ?? null,
      media_type: params.mediaType ?? null,
      message_id: params.messageId,
      direction: params.direction,
      sender_type: params.senderType,
      sender_name: params.senderName ?? null,
    }),
  }).catch(() => {});
}
