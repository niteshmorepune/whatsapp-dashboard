import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber } from "@/lib/whatsapp-numbers";

/**
 * Finds (or creates) the open/pending conversation for this contact on a
 * given WhatsApp line, so the UI can jump straight to sending a message/
 * template from the Contacts page without first opening the Inbox thread.
 * Returns just enough of the conversation for the sender to know whether the
 * 24h window is open (windowExpiresAt) — the actual send still goes through
 * the existing /api/send route with the resolved conversationId, so all of
 * that route's window/CRM-notify/SSE behavior is reused unchanged.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { whatsappNumberId } = body;
    if (!whatsappNumberId) {
      return NextResponse.json({ error: "whatsappNumberId is required" }, { status: 400 });
    }

    const allowed = await agentHasAccessToNumber(
      session.user.id,
      session.user.role,
      whatsappNumberId
    );
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const contact = await prisma.contact.findUnique({ where: { id: params.id } });
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

    let conversation = await prisma.conversation.findFirst({
      where: { contactId: contact.id, whatsappNumberId, status: { in: ["OPEN", "PENDING"] } },
      orderBy: { lastMessageAt: "desc" },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          whatsappNumberId,
          status: "OPEN",
          lastMessageAt: new Date(),
        },
      });
    }

    return NextResponse.json(conversation, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to resolve conversation" }, { status: 500 });
  }
}
