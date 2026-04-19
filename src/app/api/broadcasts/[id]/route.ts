import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const broadcast = await prisma.broadcast.findUnique({
    where: { id: params.id },
    include: {
      template: true,
      agent: { select: { id: true, name: true } },
      recipients: {
        include: { contact: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!broadcast) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(broadcast);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.broadcast.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
