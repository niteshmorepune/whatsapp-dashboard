import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber, getEligibleAgentIdsForConversation } from "@/lib/whatsapp-numbers";
import { broadcastToAgents } from "@/lib/sse";

export const dynamic = "force-dynamic";

/**
 * Server-to-server only — for the CRM's leave-approval flow (App\Services\
 * LeaveCoverage / App\Jobs\SyncLeaveCoverToWadeskJob) to temporarily grant a
 * covering teammate visibility into ONE lead's WhatsApp conversation while
 * its usual owner/telecaller is on approved leave, on a line flagged
 * WhatsappNumber.restrictToOwnLeads.
 *
 * Deliberately find-only, never creates a Contact/Conversation — if this
 * lead was never staged in wadesk.in (no conversation exists yet), there's
 * nothing to cover, so this quietly no-ops rather than fabricating an empty
 * thread. Upserts a `crmManaged: false` ConversationAssignee row with
 * `coverUntil` set — the CRM recomputes and re-sends coverUntil on every
 * call (immediately "now" the moment the leave request is no longer
 * active), so this route never needs a separate "revoke" counterpart; the
 * visibility helpers in whatsapp-numbers.ts simply stop counting a row once
 * its coverUntil has passed.
 *
 * No-op (skipped, not an error) when the covering agent is already a
 * crmManaged assignee on this conversation (already has full, permanent
 * access — a temporary cover row would be redundant and would wrongly make
 * that access expire).
 */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = request.headers.get("X-Service-Key");
    if (!serviceKey || serviceKey !== process.env.WADESK_SERVICE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, businessNumber, coveringAgentEmail, coverUntil } = body;

    if (!phone || !businessNumber || !coveringAgentEmail || !coverUntil) {
      return NextResponse.json(
        { error: "phone, businessNumber, coveringAgentEmail, and coverUntil are required" },
        { status: 400 }
      );
    }

    const coverUntilDate = new Date(coverUntil);
    if (Number.isNaN(coverUntilDate.getTime())) {
      return NextResponse.json({ error: "coverUntil must be a valid date" }, { status: 400 });
    }

    const whatsappNumber = await prisma.whatsappNumber.findUnique({ where: { businessNumber } });
    if (!whatsappNumber) {
      return NextResponse.json({ error: "No WhatsApp number configured for that businessNumber" }, { status: 404 });
    }

    const contact = await prisma.contact.findUnique({ where: { phone } });
    if (!contact) {
      return NextResponse.json({ status: "no_conversation" }, { status: 200 });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, whatsappNumberId: whatsappNumber.id },
      orderBy: { lastMessageAt: "desc" },
    });
    if (!conversation) {
      return NextResponse.json({ status: "no_conversation" }, { status: 200 });
    }

    const coveringAgent = await prisma.agent.findUnique({ where: { email: coveringAgentEmail } });
    if (!coveringAgent || !coveringAgent.isActive) {
      return NextResponse.json({ status: "agent_not_found" }, { status: 200 });
    }

    const allowed = await agentHasAccessToNumber(coveringAgent.id, coveringAgent.role, whatsappNumber.id);
    if (!allowed) {
      return NextResponse.json({ status: "agent_no_line_access" }, { status: 200 });
    }

    const existing = await prisma.conversationAssignee.findUnique({
      where: { conversationId_agentId: { conversationId: conversation.id, agentId: coveringAgent.id } },
    });

    if (existing?.crmManaged) {
      return NextResponse.json({ status: "already_has_permanent_access" }, { status: 200 });
    }

    await prisma.conversationAssignee.upsert({
      where: { conversationId_agentId: { conversationId: conversation.id, agentId: coveringAgent.id } },
      create: { conversationId: conversation.id, agentId: coveringAgent.id, crmManaged: false, coverUntil: coverUntilDate },
      update: { coverUntil: coverUntilDate },
    });

    // Opportunistic cleanup — deletes long-expired cover rows across the
    // whole app on this same call rather than needing a dedicated cron;
    // this endpoint is hit every ~30 min while any leave cover is active.
    await prisma.conversationAssignee.deleteMany({
      where: { crmManaged: false, coverUntil: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

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
    }

    return NextResponse.json(
      { status: "covered", conversationId: conversation.id, agentId: coveringAgent.id, coverUntil: coverUntilDate.toISOString() },
      { status: 200 }
    );
  } catch (error) {
    console.error("leads/set-cover error:", error);
    return NextResponse.json({ error: "Failed to set cover" }, { status: 500 });
  }
}
