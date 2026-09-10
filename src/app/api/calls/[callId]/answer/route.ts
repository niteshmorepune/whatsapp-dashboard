import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { postCallAction, extractMetaErrorMessage } from "@/lib/meta";
import { agentHasAccessToNumber, toMetaConfig, getAgentIdsWithNumberAccess } from "@/lib/whatsapp-numbers";

/**
 * Agent answers a ringing call — body `{ sdpAnswer }` (the browser's own
 * WebRTC SDP answer, already ICE-gathered). Claims the Call row atomically
 * (RINGING → ANSWERED) before calling Meta, so two agents clicking Answer at
 * the same instant can't both succeed; the loser gets 409, not a real
 * duplicate accept sent to Meta.
 */
export async function POST(request: NextRequest, { params }: { params: { callId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sdpAnswer } = await request.json();
    if (!sdpAnswer) return NextResponse.json({ error: "sdpAnswer is required" }, { status: 400 });

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
      data: { status: "ANSWERED", answeredByAgentId: session.user.id, answeredAt: new Date() },
    });
    if (claim.count === 0) {
      return NextResponse.json({ error: "Call already answered or ended" }, { status: 409 });
    }

    try {
      await postCallAction(toMetaConfig(call.conversation.whatsappNumber), {
        action: "accept",
        call_id: call.metaCallId,
        session: { sdp_type: "answer", sdp: sdpAnswer },
      });
    } catch (error) {
      // Roll back so another agent (or a manual retry) can still take it —
      // Meta never actually connected the media, so ANSWERED would be a lie.
      await prisma.call.update({
        where: { id: params.callId },
        data: { status: "RINGING", answeredByAgentId: null, answeredAt: null },
      });
      const detail = extractMetaErrorMessage(error);
      console.error("Call answer error:", detail);
      return NextResponse.json({ error: `Failed to answer call: ${detail}` }, { status: 502 });
    }

    const eligibleAgentIds = await getAgentIdsWithNumberAccess(call.conversation.whatsappNumberId);
    broadcastToAgents(eligibleAgentIds, "call-answered", {
      callId: call.id,
      conversationId: call.conversationId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Call answer error:", error);
    return NextResponse.json({ error: "Failed to answer call" }, { status: 500 });
  }
}
