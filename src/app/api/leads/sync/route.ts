import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber, getEligibleAgentIdsForConversation } from "@/lib/whatsapp-numbers";
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
 * resolved rep(s) are among its assignees — it never creates a duplicate.
 *
 * 2026-09-09: `agentEmail` (the Lead's Sales owner) and the new
 * `telecallerEmail` (the Lead's Telecaller) are each resolved and upserted
 * as a `crmManaged: true` ConversationAssignee — swapped, not accumulated,
 * on every call: any existing crmManaged row whose agent is no longer one
 * of the two resolved this time is removed, so a reassigned-away rep stops
 * seeing this conversation once the CRM's own Lead.owner_id/telecaller_id
 * changes. A MANUAL assignee (added directly in wadesk, crmManaged=false —
 * e.g. a second Support agent helping on a thread) is never touched here.
 * This is also what actually enforces visibility once a line is flagged
 * WhatsappNumber.restrictToOwnLeads — see whatsapp-numbers.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = request.headers.get("X-Service-Key");
    if (!serviceKey || serviceKey !== process.env.WADESK_SERVICE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, name, businessNumber, agentEmail, telecallerEmail } = body;

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

    // Resolve each email independently to an active agent with access to
    // this line — an unresolved/inactive/ineligible email is silently
    // dropped from the desired set rather than erroring the whole sync
    // (matches the pre-2026-09-09 behavior for a single agentEmail).
    const numberId = whatsappNumber.id;
    const resolveEligibleAgentId = async (email: unknown): Promise<string | null> => {
      if (!email || typeof email !== "string") return null;
      const agent = await prisma.agent.findUnique({ where: { email } });
      if (!agent || !agent.isActive) return null;
      const allowed = await agentHasAccessToNumber(agent.id, agent.role, numberId);
      return allowed ? agent.id : null;
    };

    const [ownerAgentId, telecallerAgentId] = await Promise.all([
      resolveEligibleAgentId(agentEmail),
      resolveEligibleAgentId(telecallerEmail),
    ]);

    const desiredAgentIds = Array.from(new Set([ownerAgentId, telecallerAgentId].filter((id): id is string => id !== null)));

    const priorCrmManaged = await prisma.conversationAssignee.findMany({
      where: { conversationId: conversation.id, crmManaged: true },
      select: { agentId: true },
    });
    const priorCrmManagedIds = new Set(priorCrmManaged.map((a) => a.agentId));
    const newlyAddedIds = desiredAgentIds.filter((id) => !priorCrmManagedIds.has(id));

    await prisma.$transaction(async (tx) => {
      const staleIds = Array.from(priorCrmManagedIds).filter((id) => !desiredAgentIds.includes(id));
      if (staleIds.length > 0) {
        await tx.conversationAssignee.deleteMany({
          where: { conversationId: conversation!.id, crmManaged: true, agentId: { in: staleIds } },
        });
      }

      for (const agentId of desiredAgentIds) {
        await tx.conversationAssignee.upsert({
          where: { conversationId_agentId: { conversationId: conversation!.id, agentId } },
          create: { conversationId: conversation!.id, agentId, crmManaged: true },
          update: { crmManaged: true },
        });
      }
    });

    if (desiredAgentIds.length > 0 || priorCrmManagedIds.size > 0) {
      const updatedConversation = await prisma.conversation.findUnique({
        where: { id: conversation.id },
        include: {
          contact: true,
          assignees: { include: { agent: true } },
          whatsappNumber: { select: { restrictToOwnLeads: true } },
        },
      });

      if (updatedConversation) {
        const eligibleAgentIds = await getEligibleAgentIdsForConversation({
          whatsappNumberId: whatsappNumber.id,
          whatsappNumber: updatedConversation.whatsappNumber,
          assignees: updatedConversation.assignees,
        });
        broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updatedConversation });

        for (const agentId of newlyAddedIds) {
          sendToAgent(agentId, "conversation-assigned", { conversation: updatedConversation, assignedBy: "CRM" });
        }
      }
    }

    return NextResponse.json(
      { conversationId: conversation.id, contactId: contact.id, agentId: ownerAgentId, ownerAgentId, telecallerAgentId },
      { status: 200 }
    );
  } catch (error) {
    console.error("leads/sync error:", error);
    return NextResponse.json({ error: "Failed to sync lead" }, { status: 500 });
  }
}
