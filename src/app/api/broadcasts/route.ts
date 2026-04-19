import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const broadcasts = await prisma.broadcast.findMany({
    include: {
      template: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(broadcasts);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, templateId, contactIds } = await request.json();
  if (!templateId || !Array.isArray(contactIds) || contactIds.length === 0)
    return NextResponse.json({ error: "templateId and at least one contactId are required" }, { status: 400 });

  const broadcast = await prisma.broadcast.create({
    data: {
      name: name?.trim() || `Broadcast ${new Date().toLocaleDateString()}`,
      templateId,
      agentId: session.user.id,
      recipients: {
        create: contactIds.map((contactId: string) => ({ contactId })),
      },
    },
    include: {
      template: { select: { id: true, name: true } },
      _count: { select: { recipients: true } },
    },
  });
  return NextResponse.json(broadcast, { status: 201 });
}
