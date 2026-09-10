import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { postCallAction, extractMetaErrorMessage } from "@/lib/meta";
import { agentHasAccessToNumber, toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { recordCallSummaryMessage } from "@/lib/call-summary";

/** Agent declines a ringing call. Same atomic-claim shape as answer/route.ts. */
export async function POST(request: NextRequest, { params }: { params: { callId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const call = await prisma.call.findUnique({
      where: { id: params.callId },
      include: { conversation: { include: { whatsappNumber: true } } },
    });
    if (!call) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const allowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      call.conversation.whatsappNumberId
    );
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const claim = await prisma.call.updateMany({
      where: { id: params.callId, status: "RINGING" },
      data: { status: "REJECTED", endedAt: new Date() },
    });
    if (claim.count === 0) {
      return NextResponse.json({ error: "Call already answered or ended" }, { status: 409 });
    }

    try {
      await postCallAction(toMetaConfig(call.conversation.whatsappNumber), {
        action: "reject",
        call_id: call.metaCallId,
      });
    } catch (error) {
      // Already marked REJECTED locally regardless — a failed reject call to
      // Meta just means Meta's own ~30-60s no-answer timeout closes it out
      // instead, not a stuck ringing state on our side.
      console.error("Call reject error:", extractMetaErrorMessage(error));
    }

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(call.conversation.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "call-ended", {
      callId: call.id,
      conversationId: call.conversationId,
      status: "REJECTED",
    });
    await recordCallSummaryMessage(
      call.conversationId,
      call.conversation.whatsappNumberId,
      call.metaCallId,
      "REJECTED",
      null
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Call reject error:", error);
    return NextResponse.json({ error: "Failed to reject call" }, { status: 500 });
  }
}
