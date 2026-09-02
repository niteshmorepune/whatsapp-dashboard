import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";

/**
 * Removes one agent from a conversation's assignee list. Unassigning an
 * agent who wasn't assigned is a no-op, not an error — same idempotent
 * spirit as the POST /assignees route.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; agentId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const existing = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requesterAllowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      existing.whatsappNumberId
    );
    if (!requesterAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await prisma.conversationAssignee.deleteMany({
      where: { conversationId: params.id, agentId: params.agentId },
    });

    const updated = await prisma.conversation.findUniqueOrThrow({
      where: { id: params.id },
      include: { contact: true, assignees: { include: { agent: true } } },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(existing.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updated });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to unassign agent" }, { status: 500 });
  }
}
