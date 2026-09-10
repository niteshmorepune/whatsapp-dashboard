import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { postCallAction, extractMetaErrorMessage } from "@/lib/meta";
import { agentHasAccessToNumber, toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";
import { recordCallSummaryMessage } from "@/lib/call-summary";

/**
 * Ends an active call. Any agent granted this line can hang up, not just
 * whoever answered — same as any granted agent can already message on a
 * conversation regardless of who's assigned.
 */
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

    const endedAt = new Date();
    const durationSeconds = call.answeredAt
      ? Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000)
      : null;

    const claim = await prisma.call.updateMany({
      where: { id: params.callId, status: "ANSWERED" },
      data: { status: "COMPLETED", endedAt, durationSeconds },
    });
    if (claim.count === 0) {
      return NextResponse.json({ error: "Call is not currently active" }, { status: 409 });
    }

    try {
      await postCallAction(toMetaConfig(call.conversation.whatsappNumber), {
        action: "terminate",
        call_id: call.metaCallId,
      });
    } catch (error) {
      // Already marked COMPLETED locally — Meta's own terminate webhook (if
      // it still arrives) will just no-op against an already-ended call.
      console.error("Call hangup error:", extractMetaErrorMessage(error));
    }

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(call.conversation.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "call-ended", {
      callId: call.id,
      conversationId: call.conversationId,
      status: "COMPLETED",
    });
    await recordCallSummaryMessage(
      call.conversationId,
      call.conversation.whatsappNumberId,
      call.metaCallId,
      "COMPLETED",
      durationSeconds
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Call hangup error:", error);
    return NextResponse.json({ error: "Failed to hang up call" }, { status: 500 });
  }
}
