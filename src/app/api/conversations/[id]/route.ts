import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: { contact: true, agent: true, whatsappNumber: { select: { id: true, label: true, businessNumber: true } } },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const allowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      conversation.whatsappNumberId
    );
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return NextResponse.json(conversation);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch conversation" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { status, agentId } = body;

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
      data: {
        ...(status && { status }),
        ...(agentId !== undefined && { agentId }),
      },
      include: { contact: true, agent: true },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(existing.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updated });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 });
  }
}
