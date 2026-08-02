import axios from "axios";

const META_API_VERSION = "v18.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaNumberConfig {
  phoneNumberId: string;
  accessToken: string;
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
