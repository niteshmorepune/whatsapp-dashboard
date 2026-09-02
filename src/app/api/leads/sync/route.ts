import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { broadcastToAgents, sendToAgent } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * Server-to-server only (no session fallback) — for the CRM to stage a
 * Contact + Conversation the moment a Lead is created or reassigned, so a
 * Sales rep opens wadesk and the lead is already sitting in their queue
 * with the right name/number, instead of having to re-type it there.
 *
 * Deliberately sends NO message and makes no Meta API call — most leads
 * synced this way never messaged in first, and WhatsApp's rules require an
 * approved template for any business-initiated text outside an open
 * customer-service window. This route only stages internal state.
 *
 * Idempotent by (phone, businessNumber): if a Conversation already exists
 * for this contact on this line (e.g. the lead actually messaged in first
 * and /api/webhook already created it), this just ensures the CRM's
 * resolved rep is among its assignees — it never creates a duplicate.
 *
 * Fully-equal multi-agent assignment (2026-09-02): the CRM's owner is
 * ADDED to whatever assignees already exist (a second Support agent
 * assigned directly in wadesk is never silently dropped by a later CRM
 * sync ping) — never a full replace.
 */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = request.headers.get("X-Service-Key");
    if (!serviceKey || serviceKey !== process.env.WADESK_SERVICE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, name, businessNumber, agentEmail } = body;

    if (!phone || !businessNumber) {
      return NextResponse.json({ error: "phone and businessNumber are required" }, { status: 400 });
    }

    const whatsappNumber = await prisma.whatsappNumber.findUnique({ where: { businessNumber } });
    if (!whatsappNumber) {
      return NextResponse.json({ error: "No WhatsApp number configured for that businessNumber" }, { status: 404 });
    }

    const contact = await prisma.contact.upsert({
      where: { phone },
      create: { phone, name: name || null },
      update: name ? { name } : {},
    });

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, whatsappNumberId: whatsappNumber.id },
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

    // Only add an assignee when a resolvable, authorized agent is given —
    // an unresolved/omitted agentEmail leaves existing assignees alone
    // rather than touching them.
    let assignedAgentId: string | null = null;
    if (agentEmail) {
      const agent = await prisma.agent.findUnique({ where: { email: agentEmail } });
      if (agent && agent.isActive) {
        const allowed = await agentHasAccessToNumber(agent.id, agent.role, whatsappNumber.id);
        if (allowed) {
          const alreadyAssigned = await prisma.conversationAssignee.findUnique({
            where: { conversationId_agentId: { conversationId: conversation.id, agentId: agent.id } },
          });

          await prisma.conversationAssignee.upsert({
            where: { conversationId_agentId: { conversationId: conversation.id, agentId: agent.id } },
            create: { conversationId: conversation.id, agentId: agent.id },
            update: {},
          });
          assignedAgentId = agent.id;

          const eligibleAgentIds = await getAgentIdsWithNumberAccess(whatsappNumber.id);
          const updatedConversation = await prisma.conversation.findUnique({
            where: { id: conversation.id },
            include: { contact: true, assignees: { include: { agent: true } } },
          });
          broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updatedConversation });
          if (!alreadyAssigned) {
            sendToAgent(agent.id, "conversation-assigned", { conversation: updatedConversation, assignedBy: "CRM" });
          }
        }
      }
    }

    return NextResponse.json(
      { conversationId: conversation.id, contactId: contact.id, agentId: assignedAgentId },
      { status: 200 }
    );
  } catch (error) {
    console.error("leads/sync error:", error);
    return NextResponse.json({ error: "Failed to sync lead" }, { status: 500 });
  }
}
