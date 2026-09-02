import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber, getAgentAccessibleNumberIds } from "@/lib/whatsapp-numbers";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const whatsappNumberId = searchParams.get("whatsappNumberId");
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = parseInt(searchParams.get("limit") ?? "50");

    const where: Record<string, unknown> = {};
    if (status && status !== "ALL") where.status = status;
    if (search) {
      where.contact = {
        OR: [
          { name: { contains: search } },
          { phone: { contains: search } },
        ],
      };
    }

    // Non-admin agents only ever see conversations on lines they've been
    // granted (AgentWhatsappNumber). Admins see every line, optionally
    // narrowed to one via ?whatsappNumberId=.
    if (whatsappNumberId) {
      const allowed = await agentHasAccessToNumber(session.user.id, session.user.role, whatsappNumberId);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      where.whatsappNumberId = whatsappNumberId;
    } else if (session.user.role !== "ADMIN") {
      const accessibleIds = await getAgentAccessibleNumberIds(session.user.id, session.user.role);
      where.whatsappNumberId = { in: accessibleIds };
    }

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        contact: true,
        assignees: { include: { agent: true } },
        whatsappNumber: { select: { id: true, label: true, businessNumber: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.conversation.count({ where });

    return NextResponse.json({ conversations, total, page, limit });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { contactId, whatsappNumberId } = body;

    if (!contactId || !whatsappNumberId) {
      return NextResponse.json({ error: "contactId and whatsappNumberId are required" }, { status: 400 });
    }

    const allowed = await agentHasAccessToNumber(session.user.id, session.user.role, whatsappNumberId);
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const conversation = await prisma.conversation.create({
      data: {
        contactId,
        whatsappNumberId,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
      include: { contact: true, assignees: { include: { agent: true } }, whatsappNumber: true },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
