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

interface NotifyCrmMessageFailedParams {
  messageId: string;
  errorCode?: number | null;
  errorMessage?: string | null;
}

/**
 * Tells the CRM that a message it doesn't otherwise hear about again — one
 * sent via POST /api/send-template, the CRM's server-to-server path for
 * Visibility Audit invites/nudges/payment confirmations — later failed to
 * actually deliver, per Meta's own async status webhook (see
 * handleStatusUpdate() in api/webhook/route.ts, the only caller).
 *
 * The CRM only ever learns "wadesk.in accepted the send request" from
 * /api/send-template's synchronous response; Meta's real delivery outcome
 * (e.g. error 131049, "healthy ecosystem engagement" throttling) can arrive
 * minutes later and previously went nowhere — the CRM's funnel dashboard
 * kept showing a genuinely undelivered message as a clean "Sent ✓" forever.
 * `messageId` is this app's own Message.id, the same value
 * /api/send-template's response already returns and the CRM already
 * persists on its own touch record specifically so it can be matched back
 * up here — see the CRM's WadeskMessageStatusController for the receiving
 * end. Deliberately called for EVERY message that goes FAILED, not just
 * ones this app can identify as CRM-originated — the CRM's own endpoint
 * does that matching (a message_id it doesn't recognize is a harmless
 * no-op there), so this app doesn't need to track which messages the CRM
 * might care about.
 *
 * Fire-and-forget, same contract as notifyCrm() above: never awaited,
 * never throws, and any failure here must never affect message-status
 * persistence on this side.
 */
export function notifyCrmMessageFailed(params: NotifyCrmMessageFailedParams): void {
  if (!process.env.CRM_MESSAGE_FAILED_URL || !process.env.CRM_WEBHOOK_TOKEN) return;

  fetch(process.env.CRM_MESSAGE_FAILED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.CRM_WEBHOOK_TOKEN}`,
    },
    body: JSON.stringify({
      message_id: params.messageId,
      error_code: params.errorCode ?? null,
      error_message: params.errorMessage ?? null,
    }),
  }).catch(() => {});
}
