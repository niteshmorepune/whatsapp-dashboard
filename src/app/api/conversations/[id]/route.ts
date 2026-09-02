import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { agentHasAccessToNumber, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { resolveAiLiveState, getHolidayDateKeys, type BusinessHours } from "@/lib/business-hours";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        contact: true,
        assignees: { include: { agent: true } },
        whatsappNumber: {
          select: { id: true, label: true, businessNumber: true, aiMode: true, businessHours: true },
        },
      },
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

    // Whether the AI after-hours assistant would currently reply on this
    // conversation's line — informational only, drives the ThreadView badge.
    const holidayDateKeys = await getHolidayDateKeys();
    const aiCurrentlyLive = resolveAiLiveState(
      conversation.whatsappNumber.aiMode,
      conversation.whatsappNumber.businessHours as BusinessHours | null,
      holidayDateKeys
    );

    return NextResponse.json({ ...conversation, aiCurrentlyLive });
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
    // Assignment is handled exclusively by /api/conversations/[id]/assignees
    // now (multi-agent, added 2026-09-02) — this route only ever touches
    // status/aiMuted. A stray `agentId` in the body is silently ignored
    // rather than erroring, since older cached frontend code could still
    // send it during a rolling deploy.
    const { status, aiMuted } = body;

    const existing = await prisma.conversation.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const requesterAllowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      existing.whatsappNumberId
    );
    if (!requesterAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await prisma.conversation.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(typeof aiMuted === "boolean" && { aiMuted }),
      },
      include: { contact: true, assignees: { include: { agent: true } } },
    });

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(existing.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updated });

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update conversation" }, { status: 500 });
  }
}
