import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcastToAgents } from "@/lib/sse";
import { getEligibleAgentIdsForConversation } from "@/lib/whatsapp-numbers";

/**
 * CRM server-to-server only (X-Service-Key, same trust boundary as
 * /api/send and /api/send-template — see middleware.ts's matcher
 * exclusion list, which this route is also added to). No human-agent
 * session path exists here, unlike /api/conversations/[id]'s PATCH
 * (which already sets aiMuted for a logged-in agent from the ThreadView
 * UI) — this is a dedicated, minimal endpoint for one caller.
 *
 * Fired by the NEDS CRM's App\Jobs\MuteWadeskConversationJob once
 * DuplicateLeadDetector (CRM-side) flags a brand-new WhatsApp-sourced Lead
 * as a possible duplicate of an older one — the same aiMuted flag a human
 * agent sending a manual reply already sets (see /api/send/route.ts),
 * reused rather than inventing new automation-hold state. Best-effort:
 * the CRM's own detection already happened and already notified staff
 * before this call is even made, so a failure here just means the NEXT
 * inbound message on this conversation still gets a normal AI reply
 * (same risk that existed before this endpoint, not a regression).
 */
export async function POST(request: NextRequest) {
  try {
    const serviceKey = request.headers.get("X-Service-Key");
    if (!serviceKey || serviceKey !== process.env.WADESK_SERVICE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId } = body;
    if (!conversationId || typeof conversationId !== "string") {
      return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!existing) {
      // Not an error worth retrying — the CRM's own Lead may have been
      // created from a conversation this app hasn't synced/kept, or the
      // id is stale. A no-op 200 keeps the caller's fire-and-forget
      // contract simple (same shape as notifyCrm()'s own .catch(() => {})).
      return NextResponse.json({ status: "not_found" });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiMuted: true },
      include: { contact: true, assignees: { include: { agent: true } } },
    });

    const eligibleAgentIds = await getEligibleAgentIdsForConversation(existing);
    broadcastToAgents(eligibleAgentIds, "conversation-updated", { conversation: updated });

    return NextResponse.json({ status: "muted" });
  } catch (error) {
    console.error("POST /api/conversations/mute failed:", error);
    return NextResponse.json({ error: "Failed to mute conversation" }, { status: 500 });
  }
}
