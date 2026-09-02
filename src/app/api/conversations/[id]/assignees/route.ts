import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents, sendToAgent } from "@/lib/sse";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";

/**
 * Adds one agent to a conversation's assignee list (fully equal multi-agent
 * assignment, added 2026-09-02 — replaces the old single-agentId /assign
 * route). Idempotent: assigning an already-assigned agent just returns the
 * conversation unchanged, same as the unique([conversationId, agentId])
 * constraint would enforce anyway.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { agentId } = await request.json();
    if (!agentId) return NextResponse.json({ error: "agentId is required" }, { status: 400 });

    const existing = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requesterAllowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      existing.whatsappNumberId
    );
    if (!requesterAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const assignee = await prisma.agent.findUnique({ where: { id: agentId }, select: { role: true } });
    const assigneeAllowed =
      !!assignee && (await agentHasAccessToNumber(agentId, assignee.role, existing.whatsappNumberId));
    if (!assigneeAllowed) {
      return NextResponse.json({ error: "Agent does not have access to this conversation's line" }, { status: 400 });
    }

    await prisma.conversationAssignee.upsert({
      where: { conversationId_agentId: { conversationId: params.id, agentId } },
      create: { conversationId: params.id, agentId },
      update: {},
    });

    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: params.id },
      include: { contact: true, assignees: { include: { agent: true } } },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(existing.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updated });

    // Notify the newly-added agent specifically (unless they added themselves).
    if (agentId !== session.user.id) {
      sendToAgent(agentId, "conversation-assigned", {
        conversation: updated,
        assignedBy: session.user.name,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to assign agent" }, { status: 500 });
  }
}
