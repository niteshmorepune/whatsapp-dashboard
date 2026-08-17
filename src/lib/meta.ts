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
