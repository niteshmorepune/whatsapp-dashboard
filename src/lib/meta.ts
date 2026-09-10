import axios from "axios";

const META_API_VERSION = "v18.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaNumberConfig {
  phoneNumberId: string;
  accessToken: string;
}

/**
 * Meta's Graph API error body is `{ error: { message, type, code,
 * error_subcode, fbtrace_id } }`. Node's default console.error/util.inspect
 * depth (2) collapses this into an unhelpful `data: { error: [Object] }`
 * when an axios error is logged directly — this pulls the real message out
 * so callers can log/return something a human can actually act on instead
 * of re-deploying with better logging every time a send fails.
 */
export function extractMetaErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const metaMessage = error.response?.data?.error?.message;
    if (typeof metaMessage === "string" && metaMessage.trim() !== "") return metaMessage;
    if (error.response?.data) return JSON.stringify(error.response.data);
    return error.message || "axios error with no message";
  }
  if (error instanceof Error) return error.message || `${error.name} with no message`;
  return String(error) || "unknown error";
}

export interface MetaStatusError {
  code: number;
  message: string;
}

/**
 * A status webhook's `errors[]` entry (distinct from the Graph API send-call
 * error `extractMetaErrorMessage()` above handles) — Meta's shape is
 * `{ code, title, message?, error_data?: { details? } }`. `error_data.details`
 * is usually the more specific, human-actionable line (e.g. why a template
 * re-engagement send was blocked) when present, so it's preferred over the
 * generic `title`/`message`. Only the first entry is used — Meta has never
 * been observed sending more than one per status update.
 */
export function extractStatusError(
  errors: unknown
): MetaStatusError | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0] as {
    code?: number;
    title?: string;
    message?: string;
    error_data?: { details?: string };
  };
  const detail = first.error_data?.details || first.message || first.title;
  if (typeof first.code !== "number" || !detail) return null;
  return { code: first.code, message: detail };
}

function clientFor(config: MetaNumberConfig) {
  return axios.create({
    baseURL: META_API_BASE,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

export async function sendTextMessage(
  config: MetaNumberConfig,
  to: string,
  text: string
): Promise<{ messageId: string }> {
  const response = await clientFor(config).post(`/${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
  return { messageId: response.data.messages?.[0]?.id };
}

export interface InteractiveListRow {
  id: string;
  // WhatsApp's own hard limits — Meta rejects the send outright if either
  // is exceeded, not a soft truncation.
  title: string; // max 24 characters
  description?: string; // max 72 characters
}

/**
 * A tappable WhatsApp "list" interactive message (more than 3 options —
 * WhatsApp's other interactive type, quick-reply buttons, caps at 3, hence
 * "list" rather than "button" here). Currently only used by the after-hours
 * assistant's goal-question flow (src/lib/goal-flow.ts). A tap comes back
 * as an inbound webhook event with `interactive.list_reply.id`/`.title` —
 * see handleInboundMessage in api/webhook/route.ts.
 */
export async function sendInteractiveListMessage(
  config: MetaNumberConfig,
  to: string,
  bodyText: string,
  buttonText: string,
  rows: readonly InteractiveListRow[]
): Promise<{ messageId: string }> {
  const response = await clientFor(config).post(`/${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: [{ rows }],
      },
    },
  });
  return { messageId: response.data.messages?.[0]?.id };
}

export async function sendTemplateMessage(
  config: MetaNumberConfig,
  to: string,
  templateName: string,
  languageCode = "en_US",
  components: unknown[] = []
): Promise<{ messageId: string }> {
  const response = await clientFor(config).post(`/${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
  return { messageId: response.data.messages?.[0]?.id };
}

export async function sendMediaMessage(
  config: MetaNumberConfig,
  to: string,
  mediaType: "image" | "document" | "audio" | "video",
  mediaId: string,
  caption?: string,
  filename?: string
): Promise<{ messageId: string }> {
  const mediaPayload: Record<string, unknown> = { id: mediaId };
  if (caption) mediaPayload.caption = caption;
  if (filename && mediaType === "document") mediaPayload.filename = filename;

  const response = await clientFor(config).post(`/${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: mediaType,
    [mediaType]: mediaPayload,
  });
  return { messageId: response.data.messages?.[0]?.id };
}

export async function markMessageRead(
  config: MetaNumberConfig,
  messageId: string
): Promise<void> {
  await clientFor(config).post(`/${config.phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

export interface CallActionBody {
  action: "pre_accept" | "accept" | "reject" | "terminate";
  call_id: string;
  session?: { sdp_type: "answer"; sdp: string };
}

/**
 * Answers/rejects/terminates a WhatsApp Calling API call. Same
 * `/{phoneNumberId}/calls` endpoint for all four actions — `session` is
 * only meaningful for `accept`/`pre_accept` (the business's own SDP
 * answer); `reject`/`terminate` take no session at all. See
 * api/webhook/route.ts's `handleCallEvent()` for the inbound `connect`
 * webhook this responds to, and api/calls/[callId]/{answer,reject,hangup}
 * for the three callers.
 */
export async function postCallAction(
  config: MetaNumberConfig,
  body: CallActionBody
): Promise<{ success: boolean }> {
  const response = await clientFor(config).post(`/${config.phoneNumberId}/calls`, {
    messaging_product: "whatsapp",
    ...body,
  });
  return response.data;
}

/**
 * Media (upload/download) is proxied through whichever number's token is
 * passed in — Meta scopes media access by the app/token, not by a specific
 * message, so any number on the same app can fetch/upload as long as the
 * caller supplies that number's own token.
 */
export function metaClientFor(config: MetaNumberConfig) {
  return clientFor(config);
}

export interface MetaTemplateSummary {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components: Array<{
    type: string;
    text?: string;
    buttons?: Array<{ type: string; text?: string; url?: string }>;
  }>;
}

/**
 * True when this template has a URL button whose destination is Dynamic
 * (Meta represents that as a `{{1}}` placeholder inside the button's `url`,
 * appended by the caller at send time — see /api/send-template's
 * `buttonUrlParam`). A template with a Static URL button has no such
 * placeholder and needs no parameter at all.
 */
export function templateHasButtonParam(components: MetaTemplateSummary["components"]): boolean {
  const buttonsComponent = components.find((c) => c.type === "BUTTONS");
  return (
    buttonsComponent?.buttons?.some((b) => b.type === "URL" && b.url?.includes("{{1}}")) ?? false
  );
}

/**
 * Lists every template (any status — APPROVED/PENDING/REJECTED/IN_APPEAL)
 * registered on a WABA, for syncing into our own Template table so a
 * Meta-approved template doesn't also need re-entering here by hand. Paginates
 * via Meta's own `paging.next` (already a complete absolute URL).
 */
export async function listMessageTemplates(
  accessToken: string,
  wabaId: string
): Promise<MetaTemplateSummary[]> {
  const templates: MetaTemplateSummary[] = [];
  let nextUrl: string | null =
    `${META_API_BASE}/${wabaId}/message_templates?fields=name,status,category,language,components&limit=100`;

  while (nextUrl) {
    const response: { data: { data?: MetaTemplateSummary[]; paging?: { next?: string } } } =
      await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    templates.push(...(response.data.data ?? []));
    nextUrl = response.data.paging?.next ?? null;
  }

  return templates;
}
