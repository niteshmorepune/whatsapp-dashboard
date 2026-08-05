import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage } from "@/lib/meta";
import { toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { broadcastToAgents } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * Server-to-server only (no session fallback) — for an external system (the
 * CRM's Deal-Won handoff, so far) to trigger a business-initiated template
 * message to a phone number that may never have messaged us before, so
 * there's no existing Conversation to attach a normal /api/send call to.
 *
 * Unlike /api/send, this identifies the line by businessNumber and the
 * template by name — a caller like the CRM has no reason to know wadesk's
 * internal WhatsappNumber/Template row IDs.
 *
 * Deliberately does NOT set/extend windowExpiresAt on the conversation this
 * creates or reuses — per WhatsApp's actual rules, only a real inbound
 * message from the customer opens the 24h customer-service window; a
 * business-initiated template send never does, regardless of who triggers it.
 */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = request.headers.get("X-Service-Key");
    if (!serviceKey || serviceKey !== process.env.WADESK_SERVICE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, businessNumber, templateName, variables, resolveOtherLines } = body;

    if (!phone || !businessNumber || !templateName) {
      return NextResponse.json(
        { error: "phone, businessNumber, and templateName are required" },
        { status: 400 }
      );
    }

    // Optional {{1}}, {{2}}, ... body variables, e.g. ["Ravi"] for a
    // template body containing "Hi {{1}},". Omit entirely for a template
    // with no variables.
    const components =
      Array.isArray(variables) && variables.length > 0
        ? [
            {
              type: "body",
              parameters: variables.map((v: string) => ({ type: "text", text: v })),
            },
          ]
        : [];

    const whatsappNumber = await prisma.whatsappNumber.findUnique({ where: { businessNumber } });
    if (!whatsappNumber) {
      return NextResponse.json({ error: "No WhatsApp number configured for that businessNumber" }, { status: 404 });
    }

    const template = await prisma.template.findUnique({ where: { name: templateName } });
    if (!template || !template.isApproved) {
      return NextResponse.json({ error: "Template not found or not approved" }, { status: 404 });
    }

    const contact = await prisma.contact.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, whatsappNumberId: whatsappNumber.id, status: { in: ["OPEN", "PENDING"] } },
      orderBy: { lastMessageAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          whatsappNumberId: whatsappNumber.id,
          status: "OPEN",
          lastMessageAt: new Date(),
        },
      });
    }

    // Used by the CRM's Deal-Won handoff: once a client is being handed to
    // support on this line, any still-open conversation for the same
    // contact on a DIFFERENT line (e.g. the pre-sale Marketing line) is
    // stale — resolve it so it drops out of that line's active queue.
    if (resolveOtherLines) {
      await prisma.conversation.updateMany({
        where: {
          contactId: contact.id,
          whatsappNumberId: { not: whatsappNumber.id },
          status: { in: ["OPEN", "PENDING"] },
        },
        data: { status: "RESOLVED" },
      });
    }

    // "en" not "en_US" — the welcome_to_support template was submitted in
    // Meta as plain "English", not "English (US)"; Meta matches templates by
    // exact name+language pair, so this must match whatever was actually
    // selected at submission time, not assumed.
    const { messageId } = await sendTemplateMessage(
      toMetaConfig(whatsappNumber),
      phone,
      template.name,
      "en",
      components
    );

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        content: `[Template: ${template.name}]`,
        metaMessageId: messageId ?? null,
        status: "SENT",
        sentByAgentId: null,
      },
    });

    const updatedConversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
      include: { contact: true, agent: true },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumber.id);
    broadcastToAgents(eligibleAgentIds, "new-message", {
      conversationId: conversation.id,
      message,
      conversation: updatedConversation,
    });
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updatedConversation });

    return NextResponse.json({ conversationId: conversation.id, messageId: message.id }, { status: 201 });
  } catch (error) {
    console.error("send-template error:", error);
    return NextResponse.json({ error: "Failed to send template" }, { status: 500 });
  }
}
