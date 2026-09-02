import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";

/**
 * Minimal (id, name only) agent list for populating the multi-assign picker
 * on one conversation — added 2026-09-02 alongside multi-agent assignment
 * to fix a real, pre-existing gap this repo's own docs already flagged:
 * `GET /api/agents` is ADMIN-only, so a non-admin AGENT's assign dropdown
 * silently rendered empty (the fetch 403'd and was swallowed). Deliberately
 * a NEW, narrow, any-authenticated-agent-with-line-access route rather than
 * relaxing `/api/agents` itself, which returns full management data (email,
 * conversation counts, every line grant) an AGENT has no business seeing
 * about their peers.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const conversation = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requesterAllowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      conversation.whatsappNumberId
    );
    if (!requesterAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(conversation.whatsappNumberId);
    const agents = await prisma.agent.findMany({
      where: { id: { in: eligibleAgentIds }, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(agents);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch eligible agents" }, { status: 500 });
  }
}
