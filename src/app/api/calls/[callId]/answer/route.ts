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

    // Real incident, 2026-09-10: this used to broadcast to every eligible
    // agent, including whoever just answered. That agent's own browser
    // treats any call-answered for its active call as "someone else took
    // it" and tears down the connection immediately -- so the moment a
    // call was successfully answered, the answering browser received its
    // own confirmation and instantly killed the just-established
    // RTCPeerConnection, before audio could ever flow. Meta was never told
    // to terminate (teardown() is local-only), so the caller's phone
    // stayed "connected" until Meta's own timeout gave up on the dead
    // media ~20s later and reported the call FAILED. Excluding the
    // answering agent here is the actual fix -- known tradeoff: a SECOND
    // open tab for that same agent (sse.ts supports multi-tab per agent)
    // won't be told the call was answered elsewhere and will keep ringing
    // until its own 60s ring timeout, since agentIds are the broadcast
    // unit, not individual connections.
    const eligibleAgentIds = (await getAgentIdsWithNumberAccess(call.conversation.whatsappNumberId)).filter(
      (id) => id !== session.user.id
    );
    if (eligibleAgentIds.length > 0) {
      broadcastToAgents(eligibleAgentIds, "call-answered", {
        callId: call.id,
        conversationId: call.conversationId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Call answer error:", error);
    return NextResponse.json({ error: "Failed to answer call" }, { status: 500 });
  }
}
