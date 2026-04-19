import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAll, sendToAgent } from "@/lib/sse";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { agentId } = await request.json();

    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: { agentId: agentId ?? null },
      include: { contact: true, agent: true },
    });

    broadcastToAll("conversation-updated", { conversation: updated });

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
