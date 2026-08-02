import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents, sendToAgent } from "@/lib/sse";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { agentId } = await request.json();

    const existing = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requesterAllowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      existing.whatsappNumberId
    );
    if (!requesterAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    if (agentId) {
      const assignee = await prisma.agent.findUnique({ where: { id: agentId }, select: { role: true } });
      const assigneeAllowed =
        !!assignee && (await agentHasAccessToNumber(agentId, assignee.role, existing.whatsappNumberId));
      if (!assigneeAllowed) {
        return NextResponse.json({ error: "Agent does not have access to this conversation's line" }, { status: 400 });
      }
    }

    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: { agentId: agentId ?? null },
      include: { contact: true, agent: true },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(existing.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updated });

    // Notify the newly assigned agent specifically
    if (agentId && agentId !== session.user.id) {
      sendToAgent(agentId, "conversation-assigned", {
        conversation: updated,
        assignedBy: session.user.name,
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to assign" }, { status: 500 });
  }
}
