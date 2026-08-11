import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { question, answer, isActive, whatsappNumberId } = await request.json();
  const entry = await prisma.faqEntry.update({
    where: { id: params.id },
    data: {
      ...(question !== undefined && { question: question.trim() }),
      ...(answer !== undefined && { answer: answer.trim() }),
      ...(typeof isActive === "boolean" && { isActive }),
      ...(whatsappNumberId !== undefined && { whatsappNumberId: whatsappNumberId || null }),
    },
    include: { whatsappNumber: { select: { id: true, label: true } } },
  });
  return NextResponse.json(entry);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.faqEntry.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
