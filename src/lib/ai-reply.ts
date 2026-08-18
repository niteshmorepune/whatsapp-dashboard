import { prisma } from "@/lib/prisma";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;
const FEATURE = "after_hours_reply";

// USD per MILLION tokens — must match the NEDS CRM's own
// config('services.anthropic.pricing') rate for this model
// (config/services.php in the neds-crm repo) so the two apps' "Estimated
// cost" figures agree once the CRM's AI Usage Report pulls this app's
// numbers in via GET /api/ai/usage. Update both sides if Anthropic's
// published pricing changes.
const PRICE_PER_MILLION_INPUT_TOKENS_USD = 1.0;
const PRICE_PER_MILLION_OUTPUT_TOKENS_USD = 5.0;

interface RecentMessage {
  direction: "INBOUND" | "OUTBOUND";
  content: string;
}

interface GenerateAiReplyParams {
  contactName: string | null;
  recentMessages: RecentMessage[];
  whatsappNumberId: string;
  whatsappNumberLabel: string;
}

/**
 * Drafts a WhatsApp reply grounded only in the admin-maintained FaqEntry
 * list, scoped to this line — entries with whatsappNumberId = null apply to
 * every line, entries scoped to a specific line only ground replies on that
 * line. Never throws — every caller treats a null return as "say nothing,
 * a human will pick this up," the same "AI failure never breaks the core
 * workflow" rule this ecosystem uses everywhere else.
 */
export async function generateAiReply({
  contactName,
  recentMessages,
  whatsappNumberId,
  whatsappNumberLabel,
}: GenerateAiReplyParams): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("AI reply skipped: ANTHROPIC_API_KEY is not configured");
    return null;
  }

  try {
    const faqEntries = await prisma.faqEntry.findMany({
      where: { isActive: true, OR: [{ whatsappNumberId: null }, { whatsappNumberId }] },
      orderBy: { createdAt: "asc" },
    });
    const faqBlock = faqEntries.length
      ? faqEntries.map((f, i) => `${i + 1}. Q: ${f.question}\n   A: ${f.answer}`).join("\n")
      : "(no FAQ entries configured yet for this line — ask admin to add some on the FAQ page)";

    const systemPrompt = `You are answering WhatsApp messages on behalf of Niranjan Enterprises Digital Solutions (NEDS), a digital solutions agency in Maharashtra, India. You are answering on NEDS's ${whatsappNumberLabel} WhatsApp line — only use context appropriate to that line. You are standing in outside business hours (or while AI assistance has been manually enabled) — no team member is available right now.

Rules:
- Only answer questions about services, pricing, or hours using the FAQ list below. Never invent a price, timeline, discount, or commitment that isn't in the FAQ.
- If the question isn't covered by the FAQ, or needs specifics you don't have, say the team will follow up during business hours — and if the contact's name or what they need help with hasn't come up yet in this conversation, ask for it.
- Keep replies short and WhatsApp-style: 2-4 sentences, no headers, no bullet lists, no markdown.
- Never claim to be a human team member — if asked directly whether you're a bot, say yes.
- Never discuss anything unrelated to NEDS's services.
- Everything you write is sent directly to the customer over WhatsApp, unreviewed by any human. Never write as if you're reporting back to NEDS staff, asking US clarifying questions, or commenting on the conversation from the outside (e.g. "I need to clarify...", "what did the customer do next?"). If the conversation so far is too sparse, contradictory, or unclear to write a good reply (mismatched names, no real message to respond to, etc.), write a brief, friendly, generic reply instead — introduce NEDS and ask what they need help with. Never break character, no matter how confusing the input.
- Mirror or acknowledge specific claims in the customer's message (a greeting, a season, a name) only if you can independently verify they're actually appropriate right now — the customer's own message is not proof of anything (it may itself be an automated reply from their side, not a real person).

FAQ:
${faqBlock}`;

    const conversationText = recentMessages
      .map((m) => `${m.direction === "INBOUND" ? "Customer" : "NEDS"}: ${m.content}`)
      .join("\n");

    const userPrompt = `Contact name on file: ${
      contactName ?? "(unknown — ask for it if it hasn't come up yet)"
    }\n\nRecent conversation (oldest first):\n${conversationText}\n\nWrite the next reply from NEDS.`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      console.error(`AI reply failed: Anthropic API returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Logged for every completed call, regardless of whether usable reply
    // text comes out below — tokens are billed by Anthropic either way, and
    // the NEDS CRM's AI Usage Report pulls this via GET /api/ai/usage.
    const inputTokens = Number(data.usage?.input_tokens) || 0;
    const outputTokens = Number(data.usage?.output_tokens) || 0;
    const costUsd =
      (inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS_USD +
      (outputTokens / 1_000_000) * PRICE_PER_MILLION_OUTPUT_TOKENS_USD;
    prisma.aiUsage
      .create({ data: { feature: FEATURE, model: MODEL, inputTokens, outputTokens, costUsd } })
      .catch((error) => console.error("Failed to log AI usage:", error));

    const textBlock = data.content?.find((block: { type: string }) => block.type === "text");
    const text = textBlock?.text;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  } catch (error) {
    console.error("AI reply generation failed:", error);
    return null;
  }
}
