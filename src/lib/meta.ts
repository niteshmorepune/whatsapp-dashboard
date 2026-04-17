import axios from "axios";

const META_API_VERSION = "v18.0";
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const metaClient = axios.create({
  baseURL: META_API_BASE,
  headers: {
    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  },
});

export async function sendTextMessage(
  to: string,
  text: string
): Promise<{ messageId: string }> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const response = await metaClient.post(`/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
  return { messageId: response.data.messages?.[0]?.id };
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  languageCode = "en_US",
  components: unknown[] = []
): Promise<{ messageId: string }> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const response = await metaClient.post(`/${phoneNumberId}/messages`, {
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

export async function markMessageRead(messageId: string): Promise<void> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  await metaClient.post(`/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}
