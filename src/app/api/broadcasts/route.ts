import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { agentHasAccessToNumber } from "@/lib/whatsapp-numbers";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const broadcasts = await prisma.broadcast.findMany({
    include: {
      template: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
      whatsappNumber: { select: { id: true, label: true, businessNumber: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(broadcasts);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, templateId, contactIds, whatsappNumberId } = await request.json();
  if (!templateId || !whatsappNumberId || !Array.isArray(contactIds) || contactIds.length === 0)
    return NextResponse.json(
      { error: "templateId, whatsappNumberId, and at least one contactId are required" },
      { status: 400 }
    );

  const allowed = await agentHasAccessToNumber(session.user.id, session.user.role, whatsappNumberId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const broadcast = await prisma.broadcast.create({
    data: {
      name: name?.trim() || `Broadcast ${new Date().toLocaleDateString()}`,
      templateId,
      agentId: session.user.id,
      whatsappNumberId,
      recipients: {
        create: contactIds.map((contactId: string) => ({ contactId })),
      },
    },
    include: {
      template: { select: { id: true, name: true } },
      whatsappNumber: { select: { id: true, label: true, businessNumber: true } },
      _count: { select: { recipients: true } },
    },
  });
  return NextResponse.json(broadcast, { status: 201 });
}
